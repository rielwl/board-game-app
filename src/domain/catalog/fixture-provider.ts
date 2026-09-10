import { FIXTURE_GAMES } from './fixture-data';
import {
  CatalogNotFoundError,
  type CatalogCollectionItem,
  type CatalogGame,
  type CatalogSearchResult,
  type GameCatalogProvider,
} from './types';

/**
 * Offline catalog provider.
 *
 * Selected when BGG_ENABLED is false, and used by the test suites. It answers
 * from a fixed in-memory list, which is what lets acceptance criterion 9 —
 * "the application remains usable when BGG is disabled or fails" — be more
 * than a claim.
 */
export class FixtureCatalogProvider implements GameCatalogProvider {
  readonly id = 'fixture' as const;
  readonly label = 'Offline sample catalog';
  readonly enabled = true;

  private readonly games: CatalogGame[];
  private readonly collections: Map<string, number[]>;

  constructor(
    games: CatalogGame[] = FIXTURE_GAMES,
    collections: Record<string, number[]> = {
      // Lowercased usernames. Used by the seed and the e2e import test.
      demo: [13, 30549, 39856, 178900],
      heavygamer: [167791, 224517, 342942, 12333],
    },
  ) {
    this.games = games;
    this.collections = new Map(
      Object.entries(collections).map(([name, ids]) => [name.toLowerCase(), ids]),
    );
  }

  async search(query: string, options: { limit?: number } = {}): Promise<CatalogSearchResult[]> {
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return [];

    return this.games
      .filter((game) => game.name.toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, options.limit ?? 25)
      .map((game) => ({
        bggId: game.bggId,
        name: game.name,
        yearPublished: game.yearPublished,
        isExpansion: game.isExpansion,
      }));
  }

  async getGames(bggIds: number[]): Promise<CatalogGame[]> {
    const wanted = new Set(bggIds);
    return this.games.filter((game) => wanted.has(game.bggId)).map((game) => ({ ...game }));
  }

  async getCollection(username: string): Promise<CatalogCollectionItem[]> {
    const ids = this.collections.get(username.trim().toLowerCase());
    if (!ids) {
      throw new CatalogNotFoundError(
        `The offline catalog has no collection for "${username}". Try "demo" or "heavygamer", or add games manually.`,
      );
    }
    return this.games
      .filter((game) => ids.includes(game.bggId))
      .map((game) => ({
        bggId: game.bggId,
        name: game.name,
        yearPublished: game.yearPublished,
        owned: true,
        isExpansion: game.isExpansion,
      }));
  }
}
