import { describe, expect, it } from 'vitest';

import {
  BggParseError,
  parseCollectionXml,
  parseSearchXml,
  parseThingsXml,
} from '@/domain/catalog/bgg-xml';

import {
  COLLECTION_QUEUED_XML,
  COLLECTION_SINGLE_XML,
  COLLECTION_XML,
  ERROR_XML,
  HTML_ERROR_PAGE,
  SEARCH_XML,
  THING_JUNK_XML,
  THING_SPARSE_XML,
  THING_XML,
  TRUNCATED_XML,
} from './fixtures/bgg';

describe('parseThingsXml', () => {
  it('extracts every field the app stores', () => {
    const [catan] = parseThingsXml(THING_XML);

    expect(catan).toMatchObject({
      bggId: 13,
      name: 'CATAN',
      yearPublished: 1995,
      minPlayers: 3,
      maxPlayers: 4,
      playingTime: 120,
      minPlayTime: 60,
      maxPlayTime: 120,
      minAge: 10,
      averageRating: 7.11,
      bayesRating: 6.94,
      usersRated: 130000,
      averageWeight: 2.3,
      numWeightVotes: 20000,
      isExpansion: false,
    });
    expect(catan?.imageUrl).toBe('https://cf.geekdo-images.com/catan.png');
    expect(catan?.thumbnailUrl).toBe('https://cf.geekdo-images.com/catan-thumb.png');
  });

  it('prefers the primary name over alternates', () => {
    const [catan] = parseThingsXml(THING_XML);
    expect(catan?.name).toBe('CATAN');
  });

  it('decodes XML entities in names', () => {
    const expansion = parseThingsXml(THING_XML).find((game) => game.bggId === 926);
    expect(expansion?.name).toBe('CATAN: Cities & Knights');
  });

  it('collects mechanics and categories separately', () => {
    const [catan] = parseThingsXml(THING_XML);
    expect(catan?.mechanics).toEqual(['Dice Rolling', 'Trading']);
    expect(catan?.categories).toEqual(['Economic', 'Negotiation']);
  });

  it('reads the suggested-player-count poll and skips the "4+" bucket', () => {
    const [catan] = parseThingsXml(THING_XML);
    expect(catan?.playerPolls).toEqual([
      { playerCount: 1, best: 1, recommended: 3, notRecommended: 700 },
      { playerCount: 3, best: 300, recommended: 900, notRecommended: 200 },
      { playerCount: 4, best: 1400, recommended: 400, notRecommended: 60 },
    ]);
  });

  it('identifies an expansion and its inbound base game', () => {
    const expansion = parseThingsXml(THING_XML).find((game) => game.bggId === 926);
    expect(expansion?.isExpansion).toBe(true);
    expect(expansion?.baseGameBggIds).toEqual([13]);
  });

  it('does not treat a base game as an expansion of its own expansions', () => {
    const [catan] = parseThingsXml(THING_XML);
    // CATAN links out to Cities & Knights, but without inbound="true".
    expect(catan?.isExpansion).toBe(false);
    expect(catan?.baseGameBggIds).toEqual([]);
  });

  it('returns nulls, not zeroes or NaN, for absent data', () => {
    const [sparse] = parseThingsXml(THING_SPARSE_XML);

    expect(sparse).toMatchObject({
      bggId: 999901,
      name: 'Attic Find',
      // yearpublished="0" and minplaytime="0" are BGG's "unknown" markers.
      yearPublished: null,
      minPlayTime: null,
      playingTime: null,
      averageRating: null,
      bayesRating: null,
      averageWeight: null,
      numWeightVotes: null,
      usersRated: null,
    });
    expect(sparse?.playerPolls).toEqual([]);
  });

  it('skips items missing an id or a name rather than inventing them', () => {
    const games = parseThingsXml(THING_JUNK_XML);
    expect(games).toHaveLength(1);
    expect(games[0]?.bggId).toBe(7);
  });

  it('returns an empty list for an empty items document', () => {
    expect(parseThingsXml('<?xml version="1.0"?><items total="0" />')).toEqual([]);
  });

  it('throws a typed error for a BGG <errors> document', () => {
    expect(() => parseThingsXml(ERROR_XML)).toThrow(BggParseError);
    expect(() => parseThingsXml(ERROR_XML)).toThrow(/Invalid username/);
  });

  it('throws a typed error for truncated XML', () => {
    expect(() => parseThingsXml(TRUNCATED_XML)).toThrow(BggParseError);
  });

  it('throws a typed error for an empty body', () => {
    expect(() => parseThingsXml('')).toThrow(BggParseError);
    expect(() => parseThingsXml('   ')).toThrow(BggParseError);
  });

  it('does not blow up on an HTML error page', () => {
    // An upstream proxy serving HTML must not produce a crash-shaped failure.
    expect(parseThingsXml(HTML_ERROR_PAGE)).toEqual([]);
  });
});

describe('parseSearchXml', () => {
  it('deduplicates repeated ids from alternate-name matches', () => {
    const results = parseSearchXml(SEARCH_XML);
    expect(results.map((r) => r.bggId)).toEqual([13, 926]);
  });

  it('flags expansions in search results', () => {
    const results = parseSearchXml(SEARCH_XML);
    expect(results.find((r) => r.bggId === 926)?.isExpansion).toBe(true);
    expect(results.find((r) => r.bggId === 13)?.isExpansion).toBe(false);
  });

  it('returns an empty list when nothing matched', () => {
    expect(parseSearchXml('<?xml version="1.0"?><items total="0" />')).toEqual([]);
  });
});

describe('parseCollectionXml', () => {
  it('marks ownership from the status node, not the query', () => {
    const items = parseCollectionXml(COLLECTION_XML);
    expect(items).toHaveLength(3);

    const owned = items.filter((item) => item.owned).map((item) => item.bggId);
    expect(owned).toEqual([13, 30549]);
    // The wishlist row is parsed but not owned, so the import will drop it.
    expect(items.find((item) => item.bggId === 167791)?.owned).toBe(false);
  });

  it('reads the year from a text node rather than an attribute', () => {
    const items = parseCollectionXml(COLLECTION_XML);
    expect(items.find((item) => item.bggId === 13)?.yearPublished).toBe(1995);
  });

  it('handles a single-item collection that is not an array', () => {
    const items = parseCollectionXml(COLLECTION_SINGLE_XML);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ bggId: 39856, name: 'Dixit', owned: true });
  });

  it('returns nothing for the queued-response body', () => {
    // The 202 body carries a <message>, not <items>. The provider retries on
    // the status code; the parser must simply find nothing.
    expect(parseCollectionXml(COLLECTION_QUEUED_XML)).toEqual([]);
  });

  it('throws a typed error for an invalid username', () => {
    expect(() => parseCollectionXml(ERROR_XML)).toThrow(BggParseError);
  });
});
