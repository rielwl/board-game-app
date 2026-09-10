import 'server-only';

import type { Game, Prisma } from '@prisma/client';

import type { CatalogGame, CatalogSearchResult } from '@/domain/catalog/types';
import { CatalogUnavailableError } from '@/domain/catalog/types';
import { getCatalogProvider } from '@/lib/bgg';
import { getEnv } from '@/lib/env';
import { prisma } from '@/lib/prisma';

/**
 * Persistence for the global game catalog.
 *
 * Rules of the road:
 *  - One `Game` row per BGG id, shared by every user. Ownership lives in
 *    `UserGame`.
 *  - Metadata is cached in Postgres and refreshed only once its TTL expires,
 *    so ordinary page loads never hit BGG.
 *  - Concurrent refreshes of the same id are deduplicated in-process, so ten
 *    simultaneous page loads produce one outbound request, not ten.
 */

/** In-flight refreshes, keyed by BGG id. */
const inFlight = new Map<number, Promise<void>>();

function ttlCutoff(): Date {
  const hours = getEnv().BGG_CACHE_TTL_HOURS;
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function isStale(game: Pick<Game, 'lastFetchedAt' | 'source'>): boolean {
  if (game.source !== 'BGG') return false; // manual games are never refreshed
  if (!game.lastFetchedAt) return true;
  return game.lastFetchedAt < ttlCutoff();
}

// ---------------------------------------------------------------------------
// Writing catalog data
// ---------------------------------------------------------------------------

function gameFields(game: CatalogGame): Prisma.GameUncheckedCreateInput {
  return {
    bggId: game.bggId,
    bggUrl: `https://boardgamegeek.com/boardgame/${game.bggId}`,
    source: 'BGG',
    name: game.name,
    yearPublished: game.yearPublished,
    imageUrl: game.imageUrl,
    thumbnailUrl: game.thumbnailUrl,
    minPlayers: game.minPlayers,
    maxPlayers: game.maxPlayers,
    playingTime: game.playingTime,
    minPlayTime: game.minPlayTime,
    maxPlayTime: game.maxPlayTime,
    minAge: game.minAge,
    averageRating: game.averageRating,
    bayesRating: game.bayesRating,
    usersRated: game.usersRated,
    averageWeight: game.averageWeight,
    numWeightVotes: game.numWeightVotes,
    isExpansion: game.isExpansion,
    lastFetchedAt: new Date(),
  };
}

async function upsertTags(gameId: string, game: CatalogGame): Promise<void> {
  const wanted: { kind: 'MECHANIC' | 'CATEGORY'; name: string }[] = [
    ...game.mechanics.map((name) => ({ kind: 'MECHANIC' as const, name })),
    ...game.categories.map((name) => ({ kind: 'CATEGORY' as const, name })),
  ];
  if (wanted.length === 0) return;

  const tagIds: string[] = [];
  for (const tag of wanted) {
    const row = await prisma.tag.upsert({
      where: { kind_name: { kind: tag.kind, name: tag.name } },
      create: tag,
      update: {},
      select: { id: true },
    });
    tagIds.push(row.id);
  }

  await prisma.gameTag.createMany({
    data: tagIds.map((tagId) => ({ gameId, tagId })),
    skipDuplicates: true,
  });
}

async function upsertPolls(gameId: string, game: CatalogGame): Promise<void> {
  for (const poll of game.playerPolls) {
    await prisma.gamePlayerPoll.upsert({
      where: { gameId_playerCount: { gameId, playerCount: poll.playerCount } },
      create: { gameId, ...poll },
      update: {
        best: poll.best,
        recommended: poll.recommended,
        notRecommended: poll.notRecommended,
      },
    });
  }
}

/**
 * Writes catalog games into the database and returns a bggId -> row id map.
 * Idempotent: re-importing the same game updates it rather than duplicating.
 */
export async function persistCatalogGames(games: CatalogGame[]): Promise<Map<number, string>> {
  const idByBggId = new Map<number, string>();

  for (const game of games) {
    const fields = gameFields(game);
    const row = await prisma.game.upsert({
      where: { bggId: game.bggId },
      create: fields,
      update: fields,
      select: { id: true },
    });
    idByBggId.set(game.bggId, row.id);

    await upsertTags(row.id, game);
    await upsertPolls(row.id, game);
  }

  // Expansion -> base links, once every row in this batch exists.
  for (const game of games) {
    if (!game.isExpansion || game.baseGameBggIds.length === 0) continue;
    const expansionId = idByBggId.get(game.bggId);
    if (!expansionId) continue;

    const bases = await prisma.game.findMany({
      where: { bggId: { in: game.baseGameBggIds } },
      select: { id: true },
    });
    if (bases.length === 0) continue;

    await prisma.gameRelation.createMany({
      data: bases.map((base) => ({ expansionId, baseGameId: base.id })),
      skipDuplicates: true,
    });
  }

  return idByBggId;
}

// ---------------------------------------------------------------------------
// Reading, with a TTL-backed refresh
// ---------------------------------------------------------------------------

/**
 * Ensures local rows exist for the given BGG ids, fetching or refreshing from
 * the provider only when something is missing or stale.
 *
 * A provider failure is swallowed when we already have cached rows: stale data
 * beats an error page. It only propagates when there is nothing to show.
 */
export async function ensureGamesByBggIds(bggIds: number[]): Promise<Game[]> {
  const ids = [...new Set(bggIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (ids.length === 0) return [];

  const existing = await prisma.game.findMany({ where: { bggId: { in: ids } } });
  const existingByBggId = new Map(existing.map((g) => [g.bggId!, g]));

  const needed = ids.filter((id) => {
    const row = existingByBggId.get(id);
    return !row || isStale(row);
  });

  if (needed.length > 0) {
    await refreshFromProvider(needed, existing.length === 0);
    return prisma.game.findMany({ where: { bggId: { in: ids } } });
  }

  return existing;
}

/** Single-flight wrapper around a provider fetch + persist. */
async function refreshFromProvider(bggIds: number[], throwOnFailure: boolean): Promise<void> {
  const toFetch = bggIds.filter((id) => !inFlight.has(id));
  const waitFor = bggIds.map((id) => inFlight.get(id)).filter((p): p is Promise<void> => Boolean(p));

  if (toFetch.length > 0) {
    const work = (async () => {
      const provider = getCatalogProvider();
      const fetched = await provider.getGames(toFetch);

      // Pull in any base games we do not have yet, so expansions can be linked
      // and the "base game is available" rule has something to point at.
      const missingBases = [
        ...new Set(
          fetched
            .filter((g) => g.isExpansion)
            .flatMap((g) => g.baseGameBggIds)
            .filter((id) => !fetched.some((g) => g.bggId === id)),
        ),
      ];
      let bases: CatalogGame[] = [];
      if (missingBases.length > 0) {
        const known = await prisma.game.findMany({
          where: { bggId: { in: missingBases } },
          select: { bggId: true },
        });
        const knownIds = new Set(known.map((b) => b.bggId));
        const stillMissing = missingBases.filter((id) => !knownIds.has(id));
        if (stillMissing.length > 0) {
          bases = await provider.getGames(stillMissing);
        }
      }

      await persistCatalogGames([...bases, ...fetched]);
    })();

    // One shared entry for the whole batch, cleaned up when the work ends.
    const tracked = work.finally(() => {
      for (const id of toFetch) inFlight.delete(id);
    });
    // Nothing awaits the map entry unless a concurrent caller happens to pick
    // it up, so its rejection has to be marked as handled here. Without this a
    // provider outage produces an unhandled rejection per id, which Node turns
    // into a fatal error and takes the server down with it — even though the
    // failure itself is already handled below.
    tracked.catch(() => undefined);
    for (const id of toFetch) inFlight.set(id, tracked);
    waitFor.push(work);
  }

  const settled = await Promise.allSettled(waitFor);
  const failure = settled.find((r) => r.status === 'rejected');
  if (failure && failure.status === 'rejected' && throwOnFailure) {
    throw failure.reason;
  }
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export type GameSearchHit = {
  /** Present when the game is already in our database. */
  id: string | null;
  bggId: number | null;
  name: string;
  yearPublished: number | null;
  isExpansion: boolean;
  thumbnailUrl: string | null;
  source: 'local' | 'catalog';
};

/**
 * Searches the local catalog first, then asks the provider.
 *
 * When the provider is unavailable the local results are still returned, along
 * with a flag the UI uses to explain that BGG is down and manual entry is the
 * way forward.
 */
export async function searchGames(
  query: string,
  options: { limit?: number } = {},
): Promise<{ hits: GameSearchHit[]; catalogError: string | null; providerId: string }> {
  const limit = options.limit ?? 20;
  const trimmed = query.trim();
  const provider = getCatalogProvider();

  if (trimmed.length === 0) {
    return { hits: [], catalogError: null, providerId: provider.id };
  }

  const local = await prisma.game.findMany({
    where: { name: { contains: trimmed, mode: 'insensitive' } },
    orderBy: [{ usersRated: 'desc' }, { name: 'asc' }],
    take: limit,
  });

  const hits: GameSearchHit[] = local.map((game) => ({
    id: game.id,
    bggId: game.bggId,
    name: game.name,
    yearPublished: game.yearPublished,
    isExpansion: game.isExpansion,
    thumbnailUrl: game.thumbnailUrl,
    source: 'local',
  }));

  const seenBggIds = new Set(local.map((g) => g.bggId).filter((id): id is number => id != null));

  let catalogError: string | null = null;
  try {
    const remote: CatalogSearchResult[] = await provider.search(trimmed, { limit });
    for (const result of remote) {
      if (seenBggIds.has(result.bggId)) continue;
      hits.push({
        id: null,
        bggId: result.bggId,
        name: result.name,
        yearPublished: result.yearPublished,
        isExpansion: result.isExpansion,
        thumbnailUrl: null,
        source: 'catalog',
      });
    }
  } catch (error) {
    catalogError =
      error instanceof CatalogUnavailableError
        ? error.message
        : 'The game catalog is unavailable right now.';
  }

  return { hits: hits.slice(0, limit), catalogError, providerId: provider.id };
}

// ---------------------------------------------------------------------------
// Library operations
// ---------------------------------------------------------------------------

/**
 * Adds a catalog game to a user's library, creating the global Game row on
 * first sight. Adding a game twice is a no-op, not an error.
 */
export async function addCatalogGameToLibrary(
  userId: string,
  bggId: number,
): Promise<{ gameId: string; alreadyOwned: boolean }> {
  const [game] = await ensureGamesByBggIds([bggId]);
  if (!game) {
    throw new CatalogUnavailableError('That game could not be looked up right now.');
  }

  const existing = await prisma.userGame.findUnique({
    where: { userId_gameId: { userId, gameId: game.id } },
    select: { id: true },
  });
  if (existing) return { gameId: game.id, alreadyOwned: true };

  await prisma.userGame.create({ data: { userId, gameId: game.id } });
  return { gameId: game.id, alreadyOwned: false };
}

export type CollectionImportResult = {
  username: string;
  imported: number;
  alreadyOwned: number;
  skipped: number;
  total: number;
};

/**
 * Imports a public BGG collection. Only owned items are considered, and games
 * already in the library are counted rather than duplicated, so re-running an
 * import is safe.
 */
export async function importCollection(
  userId: string,
  username: string,
): Promise<CollectionImportResult> {
  const provider = getCatalogProvider();
  const items = (await provider.getCollection(username)).filter((item) => item.owned);

  const result: CollectionImportResult = {
    username,
    imported: 0,
    alreadyOwned: 0,
    skipped: 0,
    total: items.length,
  };
  if (items.length === 0) return result;

  // Detail lookups come back in provider-sized batches; ensureGamesByBggIds
  // handles the chunking and the cache.
  const games = await ensureGamesByBggIds(items.map((item) => item.bggId));
  const byBggId = new Map(games.map((g) => [g.bggId!, g]));

  const existing = await prisma.userGame.findMany({
    where: { userId, gameId: { in: games.map((g) => g.id) } },
    select: { gameId: true },
  });
  const owned = new Set(existing.map((row) => row.gameId));

  const toCreate: { userId: string; gameId: string }[] = [];
  for (const item of items) {
    const game = byBggId.get(item.bggId);
    if (!game) {
      result.skipped += 1;
      continue;
    }
    if (owned.has(game.id)) {
      result.alreadyOwned += 1;
      continue;
    }
    // Guard against the same id appearing twice in one collection export.
    if (toCreate.some((row) => row.gameId === game.id)) {
      result.alreadyOwned += 1;
      continue;
    }
    toCreate.push({ userId, gameId: game.id });
  }

  if (toCreate.length > 0) {
    const created = await prisma.userGame.createMany({ data: toCreate, skipDuplicates: true });
    result.imported = created.count;
    result.alreadyOwned += toCreate.length - created.count;
  }

  await prisma.user.update({ where: { id: userId }, data: { bggUsername: username } });

  return result;
}

/** Creates a manual game and puts it in the creator's library. */
export async function createManualGame(
  userId: string,
  input: {
    name: string;
    minPlayers: number;
    maxPlayers: number;
    playingTime?: number | null;
    averageWeight?: number | null;
    yearPublished?: number | null;
    notes?: string | null;
  },
): Promise<{ gameId: string }> {
  const game = await prisma.game.create({
    data: {
      name: input.name,
      source: 'MANUAL',
      createdById: userId,
      minPlayers: input.minPlayers,
      maxPlayers: input.maxPlayers,
      playingTime: input.playingTime ?? null,
      minPlayTime: input.playingTime ?? null,
      maxPlayTime: input.playingTime ?? null,
      averageWeight: input.averageWeight ?? null,
      yearPublished: input.yearPublished ?? null,
    },
    select: { id: true },
  });

  await prisma.userGame.create({
    data: { userId, gameId: game.id, notes: input.notes ?? null },
  });

  return { gameId: game.id };
}
