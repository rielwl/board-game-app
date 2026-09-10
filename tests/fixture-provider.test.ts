import { describe, expect, it } from 'vitest';

import { FIXTURE_GAMES } from '@/domain/catalog/fixture-data';
import { FixtureCatalogProvider } from '@/domain/catalog/fixture-provider';
import { CatalogNotFoundError, type GameCatalogProvider } from '@/domain/catalog/types';

/**
 * The offline provider is what makes "the app still works when BGG is down" a
 * property rather than a hope, so it gets the same interface tests the real
 * adapter does.
 */
describe('FixtureCatalogProvider', () => {
  const provider: GameCatalogProvider = new FixtureCatalogProvider();

  it('satisfies the GameCatalogProvider interface', () => {
    expect(provider.id).toBe('fixture');
    expect(provider.enabled).toBe(true);
    expect(typeof provider.search).toBe('function');
    expect(typeof provider.getGames).toBe('function');
    expect(typeof provider.getCollection).toBe('function');
  });

  it('searches case-insensitively on substrings', async () => {
    expect((await provider.search('wing')).map((r) => r.name)).toEqual(['Wingspan']);
    expect((await provider.search('CATAN')).length).toBeGreaterThanOrEqual(2);
  });

  it('returns nothing for a blank query', async () => {
    expect(await provider.search('  ')).toEqual([]);
  });

  it('honours the result limit', async () => {
    expect(await provider.search('a', { limit: 2 })).toHaveLength(2);
  });

  it('looks games up by id and ignores unknown ids', async () => {
    const games = await provider.getGames([13, 999999999]);
    expect(games.map((g) => g.bggId)).toEqual([13]);
  });

  it('imports only owned items for a known username', async () => {
    const items = await provider.getCollection('demo');
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.owned)).toBe(true);
  });

  it('matches usernames case-insensitively', async () => {
    const lower = await provider.getCollection('demo');
    const upper = await provider.getCollection('DEMO');
    expect(upper.map((i) => i.bggId)).toEqual(lower.map((i) => i.bggId));
  });

  it('raises a not-found error for an unknown username, pointing at manual entry', async () => {
    const error = await provider.getCollection('nobody-here').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CatalogNotFoundError);
    expect((error as Error).message).toContain('manually');
  });

  it('hands out copies, so a caller cannot mutate the fixture set', async () => {
    const [first] = await provider.getGames([13]);
    first!.name = 'Mutated';
    const [again] = await provider.getGames([13]);
    expect(again?.name).toBe('CATAN');
  });
});

describe('FIXTURE_GAMES', () => {
  it('has unique BGG ids', () => {
    const ids = FIXTURE_GAMES.map((game) => game.bggId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps player ranges coherent', () => {
    for (const game of FIXTURE_GAMES) {
      if (game.minPlayers != null && game.maxPlayers != null) {
        expect(game.maxPlayers).toBeGreaterThanOrEqual(game.minPlayers);
      }
    }
  });

  it('gives every expansion a base game that is also in the set', () => {
    const ids = new Set(FIXTURE_GAMES.map((game) => game.bggId));
    const expansions = FIXTURE_GAMES.filter((game) => game.isExpansion);

    expect(expansions.length).toBeGreaterThan(0);
    for (const expansion of expansions) {
      expect(expansion.baseGameBggIds.length).toBeGreaterThan(0);
      for (const baseId of expansion.baseGameBggIds) {
        expect(ids.has(baseId)).toBe(true);
      }
    }
  });

  it('includes a deliberately sparse game so missing-data paths get exercised', () => {
    const sparse = FIXTURE_GAMES.find(
      (game) => game.averageWeight == null && game.bayesRating == null,
    );
    expect(sparse).toBeDefined();
    expect(sparse?.playerPolls).toEqual([]);
  });

  it('keeps weights on the 1-5 scale', () => {
    for (const game of FIXTURE_GAMES) {
      if (game.averageWeight == null) continue;
      expect(game.averageWeight).toBeGreaterThanOrEqual(1);
      expect(game.averageWeight).toBeLessThanOrEqual(5);
    }
  });
});
