import { XMLParser } from 'fast-xml-parser';

import type {
  CatalogCollectionItem,
  CatalogGame,
  CatalogPlayerPoll,
  CatalogSearchResult,
} from './types';

/**
 * Parsers for the BoardGameGeek XML API2.
 *
 * These are pure functions over strings so they can be unit tested against
 * recorded fixtures, including malformed and truncated responses. Every field
 * is optional in practice: BGG omits statistics, polls, play times and even
 * years for plenty of entries, so nothing here throws on a missing node.
 */

export class BggParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BggParseError';
  }
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // Values are coerced explicitly below; automatic coercion turns ids like
  // "007" into 7 and version strings into numbers.
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
  processEntities: true,
  allowBooleanAttributes: true,
});

type Node = Record<string, unknown>;

function isNode(value: unknown): value is Node {
  return typeof value === 'object' && value !== null;
}

/** fast-xml-parser collapses single children to objects; normalise to arrays. */
function toArray(value: unknown): Node[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.filter(isNode);
  return isNode(value) ? [value] : [];
}

function attr(node: unknown, name: string): string | null {
  if (!isNode(node)) return null;
  const raw = node[`@_${name}`];
  if (raw == null) return null;
  const text = String(raw).trim();
  return text.length > 0 ? text : null;
}

function num(value: string | null): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

/** BGG uses 0 and "Not Ranked" as "no data" for several numeric fields. */
function positiveNum(value: string | null): number | null {
  const parsed = num(value);
  if (parsed == null || parsed <= 0) return null;
  return parsed;
}

function intNum(value: string | null): number | null {
  const parsed = num(value);
  if (parsed == null) return null;
  return Math.trunc(parsed);
}

function textOf(node: unknown): string | null {
  if (typeof node === 'string') return node.trim() || null;
  if (Array.isArray(node)) {
    for (const entry of node) {
      const found = textOf(entry);
      if (found) return found;
    }
    return null;
  }
  if (isNode(node)) {
    const text = node['#text'];
    if (text != null) return String(text).trim() || null;
    const value = attr(node, 'value');
    if (value) return value;
  }
  return null;
}

function parseXml(xml: string, what: string): Node {
  if (typeof xml !== 'string' || xml.trim().length === 0) {
    throw new BggParseError(`Empty ${what} response from BoardGameGeek`);
  }
  let parsed: unknown;
  try {
    parsed = parser.parse(xml);
  } catch (error) {
    throw new BggParseError(
      `Could not parse the ${what} response from BoardGameGeek: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    );
  }
  if (!isNode(parsed)) {
    throw new BggParseError(`Unexpected ${what} response shape from BoardGameGeek`);
  }
  // BGG signals some errors with an <errors> document rather than a status code.
  const errors = parsed['errors'];
  if (errors != null) {
    const message =
      toArray(isNode(errors) ? errors['error'] : null)
        .map((e) => textOf(e['message']))
        .filter(Boolean)
        .join('; ') || 'BoardGameGeek returned an error';
    throw new BggParseError(message);
  }
  return parsed;
}

/** The primary name, falling back to any name or the raw text node. */
function primaryName(item: Node): string | null {
  const names = toArray(item['name']);
  if (names.length > 0) {
    const primary = names.find((n) => attr(n, 'type') === 'primary');
    const chosen = primary ?? names[0]!;
    return attr(chosen, 'value') ?? textOf(chosen);
  }
  return textOf(item['name']);
}

function parsePlayerPolls(item: Node): CatalogPlayerPoll[] {
  const polls = toArray(item['poll']).filter(
    (poll) => attr(poll, 'name') === 'suggested_numplayers',
  );
  const out: CatalogPlayerPoll[] = [];

  for (const poll of polls) {
    for (const results of toArray(poll['results'])) {
      const rawCount = attr(results, 'numplayers');
      if (!rawCount) continue;
      // BGG emits counts like "6+" for "more than the maximum"; skip those
      // rather than guessing what number they mean.
      const playerCount = intNum(rawCount);
      if (playerCount == null || `${playerCount}` !== rawCount) continue;

      let best = 0;
      let recommended = 0;
      let notRecommended = 0;
      for (const result of toArray(results['result'])) {
        const votes = intNum(attr(result, 'numvotes')) ?? 0;
        switch (attr(result, 'value')) {
          case 'Best':
            best = votes;
            break;
          case 'Recommended':
            recommended = votes;
            break;
          case 'Not Recommended':
            notRecommended = votes;
            break;
          default:
            break;
        }
      }
      out.push({ playerCount, best, recommended, notRecommended });
    }
  }

  return out.sort((a, b) => a.playerCount - b.playerCount);
}

function linkValues(item: Node, type: string): string[] {
  return toArray(item['link'])
    .filter((link) => attr(link, 'type') === type)
    .map((link) => attr(link, 'value'))
    .filter((value): value is string => Boolean(value));
}

/** Parses a `/thing?id=...&stats=1` response. */
export function parseThingsXml(xml: string): CatalogGame[] {
  const doc = parseXml(xml, 'game detail');
  const items = toArray(isNode(doc['items']) ? (doc['items'] as Node)['item'] : null);

  const games: CatalogGame[] = [];

  for (const item of items) {
    const bggId = intNum(attr(item, 'id'));
    const name = primaryName(item);
    // Without an id and a name the row is useless; skip it rather than
    // inventing placeholder data.
    if (bggId == null || !name) continue;

    const type = attr(item, 'type') ?? '';
    const isExpansion = type === 'boardgameexpansion';

    // On an expansion, inbound="true" expansion links point at its base games.
    const baseGameBggIds = isExpansion
      ? toArray(item['link'])
          .filter(
            (link) =>
              attr(link, 'type') === 'boardgameexpansion' && attr(link, 'inbound') === 'true',
          )
          .map((link) => intNum(attr(link, 'id')))
          .filter((id): id is number => id != null)
      : [];

    const statistics = isNode(item['statistics']) ? (item['statistics'] as Node) : null;
    const ratingsNode = statistics && isNode(statistics['ratings']) ? (statistics['ratings'] as Node) : null;

    games.push({
      bggId,
      name,
      yearPublished: positiveNum(attr(item['yearpublished'], 'value')),
      imageUrl: textOf(item['image']),
      thumbnailUrl: textOf(item['thumbnail']),
      minPlayers: positiveNum(attr(item['minplayers'], 'value')),
      maxPlayers: positiveNum(attr(item['maxplayers'], 'value')),
      playingTime: positiveNum(attr(item['playingtime'], 'value')),
      minPlayTime: positiveNum(attr(item['minplaytime'], 'value')),
      maxPlayTime: positiveNum(attr(item['maxplaytime'], 'value')),
      minAge: positiveNum(attr(item['minage'], 'value')),
      averageRating: ratingsNode ? positiveNum(attr(ratingsNode['average'], 'value')) : null,
      bayesRating: ratingsNode ? positiveNum(attr(ratingsNode['bayesaverage'], 'value')) : null,
      usersRated: ratingsNode ? intNum(attr(ratingsNode['usersrated'], 'value')) : null,
      averageWeight: ratingsNode ? positiveNum(attr(ratingsNode['averageweight'], 'value')) : null,
      numWeightVotes: ratingsNode ? intNum(attr(ratingsNode['numweights'], 'value')) : null,
      isExpansion,
      baseGameBggIds,
      mechanics: linkValues(item, 'boardgamemechanic'),
      categories: linkValues(item, 'boardgamecategory'),
      playerPolls: parsePlayerPolls(item),
    });
  }

  return games;
}

/** Parses a `/search?query=...` response. */
export function parseSearchXml(xml: string): CatalogSearchResult[] {
  const doc = parseXml(xml, 'search');
  const items = toArray(isNode(doc['items']) ? (doc['items'] as Node)['item'] : null);

  const seen = new Set<number>();
  const results: CatalogSearchResult[] = [];

  for (const item of items) {
    const bggId = intNum(attr(item, 'id'));
    const name = primaryName(item);
    if (bggId == null || !name) continue;
    // The same id can appear once per matching name form.
    if (seen.has(bggId)) continue;
    seen.add(bggId);

    results.push({
      bggId,
      name,
      yearPublished: positiveNum(attr(item['yearpublished'], 'value')),
      isExpansion: attr(item, 'type') === 'boardgameexpansion',
    });
  }

  return results;
}

/** Parses a `/collection?username=...&own=1` response. */
export function parseCollectionXml(xml: string): CatalogCollectionItem[] {
  const doc = parseXml(xml, 'collection');
  const root = isNode(doc['items']) ? (doc['items'] as Node) : null;
  const items = toArray(root ? root['item'] : null);

  const seen = new Set<number>();
  const out: CatalogCollectionItem[] = [];

  for (const item of items) {
    const bggId = intNum(attr(item, 'objectid'));
    const name = primaryName(item);
    if (bggId == null || !name) continue;
    if (seen.has(bggId)) continue;

    // Trust the status node over the query parameter: the endpoint is happy to
    // return wishlist rows when other filters are combined with own=1.
    const owned = attr(item['status'], 'own') === '1';
    seen.add(bggId);

    out.push({
      bggId,
      name,
      yearPublished: positiveNum(
        attr(item['yearpublished'], 'value') ?? textOf(item['yearpublished']),
      ),
      owned,
      isExpansion: attr(item, 'subtype') === 'boardgameexpansion',
    });
  }

  return out;
}
