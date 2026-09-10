import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CatalogUnavailableError } from '@/domain/catalog/types';
import type { CatalogGame, GameCatalogProvider } from '@/domain/catalog/types';

import { makeCatalogGame } from './helpers/builders';
import { createPrismaMock } from './helpers/prisma-mock';

/**
 * Catalog persistence and search (`src/server/games.ts`).
 *
 * Prisma and the catalog provider are both mocked: what is under test is the
 * caching policy (when a stale row triggers a refresh), the degradation policy
 * (a provider outage must not lose local results), and the idempotency
 * promises the module makes in its own comments.
 */

const prisma = createPrismaMock();
const getCatalogProvider = vi.fn();
const getEnv = vi.fn(() => ({ BGG_CACHE_TTL_HOURS: 168 }));

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/bgg', () => ({ getCatalogProvider: () => getCatalogProvider() }));
vi.mock('@/lib/env', () => ({ getEnv: () => getEnv(), appUrl: () => 'https://example.test' }));

const {
  addCatalogGameToLibrary,
  createManualGame,
  ensureGamesByBggIds,
  importCollection,
  persistCatalogGames,
  searchGames,
} = await import('@/server/games');

function makeProvider(overrides: Partial<GameCatalogProvider> = {}): GameCatalogProvider {
  return {
    id: 'fixture',
    label: 'Fixtures',
    enabled: true,
    search: vi.fn(async () => []),
    getGames: vi.fn(async () => []),
    getCollection: vi.fn(async () => []),
    ...overrides,
  } as GameCatalogProvider;
}

/** A `Game` row, as far as this module cares about one. */
function gameRow(overrides: { id: string; bggId?: number | null } & Record<string, unknown>) {
  return {
    bggId: null,
    name: `Game ${overrides.id}`,
    source: 'BGG',
    lastFetchedAt: new Date(),
    yearPublished: null,
    isExpansion: false,
    thumbnailUrl: null,
    usersRated: null,
    ...overrides,
  };
}

let provider: GameCatalogProvider;

beforeEach(() => {
  prisma.reset();
  vi.clearAllMocks();
  provider = makeProvider();
  getCatalogProvider.mockImplementation(() => provider);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('persistCatalogGames', () => {
  it('upserts one row per game and returns the bggId -> row id map', async () => {
    prisma.game.upsert.mockImplementation(async ({ where }: { where: { bggId: number } }) => ({
      id: `row-${where.bggId}`,
    }));

    const map = await persistCatalogGames([makeCatalogGame({ bggId: 13 }), makeCatalogGame({ bggId: 14 })]);

    expect(map.get(13)).toBe('row-13');
    expect(map.get(14)).toBe('row-14');
    expect(prisma.game.upsert).toHaveBeenCalledTimes(2);
  });

  it('keys the upsert on bggId, so re-importing updates rather than duplicating', async () => {
    prisma.game.upsert.mockResolvedValue({ id: 'row-13' });

    await persistCatalogGames([makeCatalogGame({ bggId: 13, name: 'Catan' })]);

    const call = prisma.game.upsert.mock.calls[0]?.[0] as {
      where: unknown;
      create: { name: string };
      update: { name: string };
    };
    expect(call.where).toEqual({ bggId: 13 });
    // Create and update carry the same field set: a refresh must not leave
    // half the row at its first-seen values.
    expect(call.create.name).toBe('Catan');
    expect(call.update.name).toBe('Catan');
  });

  it('derives the BGG url from the id rather than trusting the payload', async () => {
    prisma.game.upsert.mockResolvedValue({ id: 'row-13' });

    await persistCatalogGames([makeCatalogGame({ bggId: 13 })]);

    const call = prisma.game.upsert.mock.calls[0]?.[0] as { create: { bggUrl: string } };
    expect(call.create.bggUrl).toBe('https://boardgamegeek.com/boardgame/13');
  });

  it('upserts mechanics and categories as tags and links them to the game', async () => {
    prisma.game.upsert.mockResolvedValue({ id: 'row-13' });
    prisma.tag.upsert.mockImplementation(async ({ where }: { where: { kind_name: { name: string } } }) => ({
      id: `tag-${where.kind_name.name}`,
    }));
    prisma.gameTag.createMany.mockResolvedValue({ count: 2 });

    await persistCatalogGames([
      makeCatalogGame({ bggId: 13, mechanics: ['Trading'], categories: ['Economic'] }),
    ]);

    expect(prisma.tag.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { kind_name: { kind: 'MECHANIC', name: 'Trading' } } }),
    );
    expect(prisma.tag.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { kind_name: { kind: 'CATEGORY', name: 'Economic' } } }),
    );
    expect(prisma.gameTag.createMany).toHaveBeenCalledWith({
      data: [
        { gameId: 'row-13', tagId: 'tag-Trading' },
        { gameId: 'row-13', tagId: 'tag-Economic' },
      ],
      skipDuplicates: true,
    });
  });

  it('skips the tag write entirely when a game has no tags', async () => {
    prisma.game.upsert.mockResolvedValue({ id: 'row-13' });

    await persistCatalogGames([makeCatalogGame({ bggId: 13 })]);

    expect(prisma.tag.upsert).not.toHaveBeenCalled();
    expect(prisma.gameTag.createMany).not.toHaveBeenCalled();
  });

  it('upserts player polls keyed by (game, player count)', async () => {
    prisma.game.upsert.mockResolvedValue({ id: 'row-13' });
    prisma.gamePlayerPoll.upsert.mockResolvedValue({});

    await persistCatalogGames([
      makeCatalogGame({
        bggId: 13,
        playerPolls: [{ playerCount: 4, best: 10, recommended: 5, notRecommended: 1 }],
      }),
    ]);

    expect(prisma.gamePlayerPoll.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { gameId_playerCount: { gameId: 'row-13', playerCount: 4 } },
        update: { best: 10, recommended: 5, notRecommended: 1 },
      }),
    );
  });

  it('links an expansion to base games that exist, in a second pass', async () => {
    prisma.game.upsert.mockImplementation(async ({ where }: { where: { bggId: number } }) => ({
      id: `row-${where.bggId}`,
    }));
    prisma.game.findMany.mockResolvedValue([{ id: 'row-13' }]);
    prisma.gameRelation.createMany.mockResolvedValue({ count: 1 });

    await persistCatalogGames([
      makeCatalogGame({ bggId: 13 }),
      makeCatalogGame({ bggId: 926, isExpansion: true, baseGameBggIds: [13] }),
    ]);

    expect(prisma.gameRelation.createMany).toHaveBeenCalledWith({
      data: [{ expansionId: 'row-926', baseGameId: 'row-13' }],
      skipDuplicates: true,
    });
  });

  it('does not write a relation when the base game is not in the database', async () => {
    prisma.game.upsert.mockResolvedValue({ id: 'row-926' });
    prisma.game.findMany.mockResolvedValue([]);

    await persistCatalogGames([
      makeCatalogGame({ bggId: 926, isExpansion: true, baseGameBggIds: [13] }),
    ]);

    expect(prisma.gameRelation.createMany).not.toHaveBeenCalled();
  });
});

describe('ensureGamesByBggIds', () => {
  it('returns nothing, and asks nothing, for an empty id list', async () => {
    await expect(ensureGamesByBggIds([])).resolves.toEqual([]);
    expect(prisma.game.findMany).not.toHaveBeenCalled();
  });

  it('discards ids that are not positive integers', async () => {
    await expect(ensureGamesByBggIds([0, -1, 1.5, Number.NaN])).resolves.toEqual([]);
    expect(prisma.game.findMany).not.toHaveBeenCalled();
  });

  it('deduplicates repeated ids before querying', async () => {
    const row = gameRow({ id: 'g1', bggId: 13 });
    prisma.game.findMany.mockResolvedValue([row]);

    await ensureGamesByBggIds([13, 13, 13]);

    expect(prisma.game.findMany).toHaveBeenCalledWith({ where: { bggId: { in: [13] } } });
  });

  it('serves a fresh cached row without calling the provider', async () => {
    const row = gameRow({ id: 'g1', bggId: 13, lastFetchedAt: new Date() });
    prisma.game.findMany.mockResolvedValue([row]);

    await expect(ensureGamesByBggIds([13])).resolves.toEqual([row]);
    expect(provider.getGames).not.toHaveBeenCalled();
  });

  it('never refreshes a manual game, however old it is', async () => {
    const row = gameRow({
      id: 'g1',
      bggId: null,
      source: 'MANUAL',
      lastFetchedAt: new Date('2000-01-01'),
    });
    prisma.game.findMany.mockResolvedValue([{ ...row, bggId: 13 }]);

    await ensureGamesByBggIds([13]);

    expect(provider.getGames).not.toHaveBeenCalled();
  });

  it('refreshes a row whose TTL has expired', async () => {
    const stale = gameRow({ id: 'g1', bggId: 13, lastFetchedAt: new Date(Date.now() - 200 * 3600_000) });
    prisma.game.findMany.mockResolvedValue([stale]);
    prisma.game.upsert.mockResolvedValue({ id: 'g1' });
    provider = makeProvider({ getGames: vi.fn(async () => [makeCatalogGame({ bggId: 13 })]) });

    await ensureGamesByBggIds([13]);

    expect(provider.getGames).toHaveBeenCalledWith([13]);
  });

  it('refreshes a row that has never been fetched', async () => {
    prisma.game.findMany.mockResolvedValue([gameRow({ id: 'g1', bggId: 13, lastFetchedAt: null })]);
    prisma.game.upsert.mockResolvedValue({ id: 'g1' });
    provider = makeProvider({ getGames: vi.fn(async () => [makeCatalogGame({ bggId: 13 })]) });

    await ensureGamesByBggIds([13]);

    expect(provider.getGames).toHaveBeenCalledWith([13]);
  });

  it('pulls in base games an offered expansion depends on', async () => {
    prisma.game.findMany
      .mockResolvedValueOnce([]) // initial lookup: nothing cached
      .mockResolvedValueOnce([]) // which base games do we already know? none
      .mockResolvedValueOnce([{ id: 'row-13' }]) // base-game link pass
      .mockResolvedValueOnce([gameRow({ id: 'g926', bggId: 926 })]); // final read
    prisma.game.upsert.mockImplementation(async ({ where }: { where: { bggId: number } }) => ({
      id: `row-${where.bggId}`,
    }));
    prisma.gameRelation.createMany.mockResolvedValue({ count: 1 });
    const getGames = vi
      .fn()
      .mockResolvedValueOnce([makeCatalogGame({ bggId: 926, isExpansion: true, baseGameBggIds: [13] })])
      .mockResolvedValueOnce([makeCatalogGame({ bggId: 13 })]);
    provider = makeProvider({ getGames });

    await ensureGamesByBggIds([926]);

    expect(getGames).toHaveBeenNthCalledWith(1, [926]);
    expect(getGames).toHaveBeenNthCalledWith(2, [13]);
  });

  it('does not re-fetch a base game already in the database', async () => {
    prisma.game.findMany
      .mockResolvedValueOnce([]) // initial lookup: nothing cached
      .mockResolvedValueOnce([{ bggId: 13 }]) // the base game is already known
      .mockResolvedValueOnce([{ id: 'row-13' }]) // base-game link pass
      .mockResolvedValueOnce([gameRow({ id: 'g926', bggId: 926 })]); // final read
    prisma.game.upsert.mockResolvedValue({ id: 'row-926' });
    prisma.gameRelation.createMany.mockResolvedValue({ count: 1 });
    const getGames = vi
      .fn()
      .mockResolvedValueOnce([makeCatalogGame({ bggId: 926, isExpansion: true, baseGameBggIds: [13] })]);
    provider = makeProvider({ getGames });

    await ensureGamesByBggIds([926]);

    expect(getGames).toHaveBeenCalledTimes(1);
  });

  it('propagates a provider failure when there is nothing cached to fall back on', async () => {
    prisma.game.findMany.mockResolvedValue([]);
    provider = makeProvider({
      getGames: vi.fn(async () => {
        throw new CatalogUnavailableError('BGG is down.');
      }),
    });

    await expect(ensureGamesByBggIds([13])).rejects.toBeInstanceOf(CatalogUnavailableError);
  });

  it('deduplicates concurrent refreshes of the same id into one provider call', async () => {
    prisma.game.findMany.mockResolvedValue([]);
    prisma.game.upsert.mockResolvedValue({ id: 'g1' });
    let resolveFetch: (games: CatalogGame[]) => void = () => undefined;
    const pending = new Promise<CatalogGame[]>((resolve) => {
      resolveFetch = resolve;
    });
    const getGames = vi.fn(() => pending);
    provider = makeProvider({ getGames });

    const first = ensureGamesByBggIds([13]);
    const second = ensureGamesByBggIds([13]);
    // Let both calls get as far as the provider before it answers.
    await new Promise((resolve) => setTimeout(resolve, 0));
    resolveFetch([]);
    await Promise.all([first, second]);

    expect(getGames).toHaveBeenCalledTimes(1);
  });

  it('leaves no unobserved rejection behind when the provider fails', async () => {
    // The in-flight entry is usually never awaited by anyone. If its rejection
    // is not marked as handled, a provider outage becomes an unhandled
    // rejection, which Node treats as fatal.
    const unhandled: unknown[] = [];
    const record = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', record);
    try {
      const stale = gameRow({ id: 'g1', bggId: 13, lastFetchedAt: new Date('2000-01-01') });
      prisma.game.findMany.mockResolvedValue([stale]);
      provider = makeProvider({
        getGames: vi.fn(async () => {
          throw new CatalogUnavailableError('BGG is down.');
        }),
      });

      await ensureGamesByBggIds([13]);
      // Unhandled rejections are reported a turn later, so wait one out.
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', record);
    }
  });

  it('swallows a provider failure when stale rows can still be served', async () => {
    const stale = gameRow({ id: 'g1', bggId: 13, lastFetchedAt: new Date('2000-01-01') });
    prisma.game.findMany.mockResolvedValue([stale]);
    provider = makeProvider({
      getGames: vi.fn(async () => {
        throw new CatalogUnavailableError('BGG is down.');
      }),
    });

    await expect(ensureGamesByBggIds([13])).resolves.toEqual([stale]);
  });
});

describe('searchGames', () => {
  it('returns nothing for a blank query without touching the database', async () => {
    await expect(searchGames('   ')).resolves.toEqual({
      hits: [],
      catalogError: null,
      providerId: 'fixture',
    });
    expect(prisma.game.findMany).not.toHaveBeenCalled();
  });

  it('matches local games case-insensitively on the trimmed query', async () => {
    prisma.game.findMany.mockResolvedValue([]);

    await searchGames('  Catan  ');

    expect(prisma.game.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { name: { contains: 'Catan', mode: 'insensitive' } } }),
    );
  });

  it('marks local rows as local and keeps their database id', async () => {
    prisma.game.findMany.mockResolvedValue([
      gameRow({ id: 'g1', bggId: 13, name: 'Catan', yearPublished: 1995 }),
    ]);

    const { hits } = await searchGames('catan');

    expect(hits).toEqual([
      {
        id: 'g1',
        bggId: 13,
        name: 'Catan',
        yearPublished: 1995,
        isExpansion: false,
        thumbnailUrl: null,
        source: 'local',
      },
    ]);
  });

  it('appends provider results the local catalog does not already have', async () => {
    prisma.game.findMany.mockResolvedValue([gameRow({ id: 'g1', bggId: 13, name: 'Catan' })]);
    provider = makeProvider({
      search: vi.fn(async () => [
        { bggId: 13, name: 'Catan', yearPublished: 1995, isExpansion: false },
        { bggId: 926, name: 'Catan: Seafarers', yearPublished: 1997, isExpansion: true },
      ]),
    });

    const { hits } = await searchGames('catan');

    // 13 is already local, so only the expansion is added.
    expect(hits.map((hit) => hit.bggId)).toEqual([13, 926]);
    expect(hits[1]).toMatchObject({ id: null, source: 'catalog', isExpansion: true });
  });

  it('caps the combined result at the requested limit', async () => {
    prisma.game.findMany.mockResolvedValue([gameRow({ id: 'g1', bggId: 1, name: 'A' })]);
    provider = makeProvider({
      search: vi.fn(async () => [
        { bggId: 2, name: 'B', yearPublished: null, isExpansion: false },
        { bggId: 3, name: 'C', yearPublished: null, isExpansion: false },
      ]),
    });

    const { hits } = await searchGames('a', { limit: 2 });

    expect(hits).toHaveLength(2);
  });

  it('passes the caller\'s limit down to both sides of the search', async () => {
    prisma.game.findMany.mockResolvedValue([]);
    const search = vi.fn(async () => []);
    provider = makeProvider({ search });

    await searchGames('catan', { limit: 5 });

    expect(prisma.game.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5 }));
    expect(search).toHaveBeenCalledWith('catan', { limit: 5 });
  });

  it('keeps local hits and reports the provider message when the catalog is down', async () => {
    prisma.game.findMany.mockResolvedValue([gameRow({ id: 'g1', bggId: 13, name: 'Catan' })]);
    provider = makeProvider({
      search: vi.fn(async () => {
        throw new CatalogUnavailableError('BoardGameGeek is not answering.');
      }),
    });

    const { hits, catalogError } = await searchGames('catan');

    expect(hits).toHaveLength(1);
    expect(catalogError).toBe('BoardGameGeek is not answering.');
  });

  it('does not leak an unexpected error message to the client', async () => {
    prisma.game.findMany.mockResolvedValue([]);
    provider = makeProvider({
      search: vi.fn(async () => {
        throw new Error('connect ECONNREFUSED 10.0.0.5:5432');
      }),
    });

    const { catalogError } = await searchGames('catan');

    expect(catalogError).toBe('The game catalog is unavailable right now.');
  });
});

describe('addCatalogGameToLibrary', () => {
  it('creates the ownership row for a game that is not yet owned', async () => {
    prisma.game.findMany.mockResolvedValue([gameRow({ id: 'g1', bggId: 13 })]);
    prisma.userGame.findUnique.mockResolvedValue(null);
    prisma.userGame.create.mockResolvedValue({ id: 'ug1' });

    await expect(addCatalogGameToLibrary('u1', 13)).resolves.toEqual({
      gameId: 'g1',
      alreadyOwned: false,
    });
    expect(prisma.userGame.create).toHaveBeenCalledWith({ data: { userId: 'u1', gameId: 'g1' } });
  });

  it('is a no-op, not an error, when the game is already owned', async () => {
    prisma.game.findMany.mockResolvedValue([gameRow({ id: 'g1', bggId: 13 })]);
    prisma.userGame.findUnique.mockResolvedValue({ id: 'ug1' });

    await expect(addCatalogGameToLibrary('u1', 13)).resolves.toEqual({
      gameId: 'g1',
      alreadyOwned: true,
    });
    expect(prisma.userGame.create).not.toHaveBeenCalled();
  });

  it('reports the catalog as unavailable when the game cannot be resolved', async () => {
    prisma.game.findMany.mockResolvedValue([]);
    provider = makeProvider({ getGames: vi.fn(async () => []) });
    prisma.game.upsert.mockResolvedValue({ id: 'unused' });

    await expect(addCatalogGameToLibrary('u1', 13)).rejects.toBeInstanceOf(CatalogUnavailableError);
  });
});

describe('importCollection', () => {
  it('returns an empty result without writing anything for an empty collection', async () => {
    provider = makeProvider({ getCollection: vi.fn(async () => []) });

    await expect(importCollection('u1', 'ada')).resolves.toEqual({
      username: 'ada',
      imported: 0,
      alreadyOwned: 0,
      skipped: 0,
      total: 0,
    });
    expect(prisma.userGame.createMany).not.toHaveBeenCalled();
  });

  it('ignores items the collection does not mark as owned', async () => {
    provider = makeProvider({
      getCollection: vi.fn(async () => [
        { bggId: 13, name: 'Catan', yearPublished: 1995, owned: false, isExpansion: false },
      ]),
    });

    const result = await importCollection('u1', 'ada');

    expect(result.total).toBe(0);
  });

  it('imports owned games and records the BGG username on the user', async () => {
    provider = makeProvider({
      getCollection: vi.fn(async () => [
        { bggId: 13, name: 'Catan', yearPublished: 1995, owned: true, isExpansion: false },
      ]),
    });
    prisma.game.findMany.mockResolvedValue([gameRow({ id: 'g1', bggId: 13 })]);
    prisma.userGame.findMany.mockResolvedValue([]);
    prisma.userGame.createMany.mockResolvedValue({ count: 1 });
    prisma.user.update.mockResolvedValue({});

    const result = await importCollection('u1', 'ada');

    expect(result).toMatchObject({ imported: 1, alreadyOwned: 0, skipped: 0, total: 1 });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { bggUsername: 'ada' },
    });
  });

  it('counts games already in the library instead of duplicating them', async () => {
    provider = makeProvider({
      getCollection: vi.fn(async () => [
        { bggId: 13, name: 'Catan', yearPublished: 1995, owned: true, isExpansion: false },
      ]),
    });
    prisma.game.findMany.mockResolvedValue([gameRow({ id: 'g1', bggId: 13 })]);
    prisma.userGame.findMany.mockResolvedValue([{ gameId: 'g1' }]);
    prisma.user.update.mockResolvedValue({});

    const result = await importCollection('u1', 'ada');

    expect(result).toMatchObject({ imported: 0, alreadyOwned: 1 });
    expect(prisma.userGame.createMany).not.toHaveBeenCalled();
  });

  it('counts an id repeated inside one export only once', async () => {
    provider = makeProvider({
      getCollection: vi.fn(async () => [
        { bggId: 13, name: 'Catan', yearPublished: 1995, owned: true, isExpansion: false },
        { bggId: 13, name: 'Catan', yearPublished: 1995, owned: true, isExpansion: false },
      ]),
    });
    prisma.game.findMany.mockResolvedValue([gameRow({ id: 'g1', bggId: 13 })]);
    prisma.userGame.findMany.mockResolvedValue([]);
    prisma.userGame.createMany.mockResolvedValue({ count: 1 });
    prisma.user.update.mockResolvedValue({});

    const result = await importCollection('u1', 'ada');

    expect(result).toMatchObject({ imported: 1, alreadyOwned: 1, total: 2 });
  });

  it('counts a game that could not be looked up as skipped', async () => {
    provider = makeProvider({
      getCollection: vi.fn(async () => [
        { bggId: 13, name: 'Catan', yearPublished: 1995, owned: true, isExpansion: false },
        { bggId: 99, name: 'Ghost', yearPublished: null, owned: true, isExpansion: false },
      ]),
    });
    prisma.game.findMany.mockResolvedValue([gameRow({ id: 'g1', bggId: 13 })]);
    prisma.userGame.findMany.mockResolvedValue([]);
    prisma.userGame.createMany.mockResolvedValue({ count: 1 });
    prisma.user.update.mockResolvedValue({});

    const result = await importCollection('u1', 'ada');

    expect(result).toMatchObject({ imported: 1, skipped: 1, total: 2 });
  });
});

describe('createManualGame', () => {
  it('creates the game and puts it straight in the creator\'s library', async () => {
    prisma.game.create.mockResolvedValue({ id: 'g1' });
    prisma.userGame.create.mockResolvedValue({ id: 'ug1' });

    await expect(
      createManualGame('u1', { name: 'Prototype', minPlayers: 2, maxPlayers: 4, notes: 'Print and play' }),
    ).resolves.toEqual({ gameId: 'g1' });

    expect(prisma.game.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Prototype', source: 'MANUAL', createdById: 'u1' }),
      }),
    );
    expect(prisma.userGame.create).toHaveBeenCalledWith({
      data: { userId: 'u1', gameId: 'g1', notes: 'Print and play' },
    });
  });

  it('uses the single playing time for both ends of the range', async () => {
    prisma.game.create.mockResolvedValue({ id: 'g1' });
    prisma.userGame.create.mockResolvedValue({ id: 'ug1' });

    await createManualGame('u1', { name: 'Prototype', minPlayers: 2, maxPlayers: 4, playingTime: 90 });

    const call = prisma.game.create.mock.calls[0]?.[0] as {
      data: { playingTime: number; minPlayTime: number; maxPlayTime: number };
    };
    expect(call.data).toMatchObject({ playingTime: 90, minPlayTime: 90, maxPlayTime: 90 });
  });

  it('normalises omitted optional fields to null', async () => {
    prisma.game.create.mockResolvedValue({ id: 'g1' });
    prisma.userGame.create.mockResolvedValue({ id: 'ug1' });

    await createManualGame('u1', { name: 'Prototype', minPlayers: 2, maxPlayers: 4 });

    const call = prisma.game.create.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(call.data).toMatchObject({
      playingTime: null,
      averageWeight: null,
      yearPublished: null,
    });
  });
});
