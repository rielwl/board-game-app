import 'server-only';

import {
  parseCollectionXml,
  parseSearchXml,
  parseThingsXml,
} from '@/domain/catalog/bgg-xml';
import {
  CatalogNotFoundError,
  CatalogUnavailableError,
  type CatalogCollectionItem,
  type CatalogGame,
  type CatalogSearchResult,
  type GameCatalogProvider,
} from '@/domain/catalog/types';

/**
 * BoardGameGeek XML API2 adapter.
 *
 * Behaviour that matters, and why:
 *  - Every request goes through a single process-wide queue with a minimum gap
 *    between calls. BGG throttles aggressively and asks API users to be
 *    conservative; serialising is simpler than a token bucket and is plenty
 *    for an app of this size.
 *  - The collection endpoint answers 202 while it builds the export. We poll
 *    with bounded exponential backoff and then give up with a retryable error.
 *  - Detail lookups are batched to BGG's documented limit of 20 ids.
 *  - Only the documented XML API2 is used. No HTML scraping and no
 *    undocumented JSON endpoints.
 */

export type BggProviderOptions = {
  baseUrl: string;
  userAgent: string;
  apiToken?: string | undefined;
  minRequestIntervalMs: number;
  timeoutMs: number;
  /** Injected in tests. */
  fetchImpl?: typeof fetch;
  /** Injected in tests so backoff does not really sleep. */
  sleepImpl?: (ms: number) => Promise<void>;
};

/** BGG documents a maximum of 20 ids per `/thing` request. */
export const BGG_MAX_IDS_PER_REQUEST = 20;

const COLLECTION_RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 16_000, 30_000];

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class BggProvider implements GameCatalogProvider {
  readonly id = 'bgg' as const;
  readonly label = 'BoardGameGeek';
  readonly enabled = true;

  private readonly options: BggProviderOptions;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  /** Tail of the request queue. Every call chains onto it. */
  private queue: Promise<unknown> = Promise.resolve();
  private lastRequestAt = 0;

  constructor(options: BggProviderOptions) {
    this.options = options;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleepImpl ?? defaultSleep;
  }

  // -------------------------------------------------------------------------
  // Transport
  // -------------------------------------------------------------------------

  /** Serialises all outbound traffic and enforces the minimum interval. */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const gap = this.options.minRequestIntervalMs - (Date.now() - this.lastRequestAt);
      if (gap > 0) await this.sleep(gap);
      try {
        return await task();
      } finally {
        this.lastRequestAt = Date.now();
      }
    });
    // Keep the chain alive even when a task rejects.
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private buildUrl(path: string, params: Record<string, string | number | undefined>): string {
    const url = new URL(`${this.options.baseUrl.replace(/\/$/, '')}/${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value == null) continue;
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  /** One HTTP round trip. Returns the raw body plus the status code. */
  private async request(url: string): Promise<{ status: number; body: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);

    const headers: Record<string, string> = {
      Accept: 'text/xml, application/xml',
      'User-Agent': this.options.userAgent,
    };
    // BGG's public XML API2 needs no credential today. When a deployment fronts
    // it with an authenticated proxy, the token travels as a bearer header and
    // is only ever read on the server.
    if (this.options.apiToken) {
      headers.Authorization = `Bearer ${this.options.apiToken}`;
    }

    try {
      const response = await this.fetchImpl(url, {
        headers,
        signal: controller.signal,
        redirect: 'follow',
        cache: 'no-store',
      });
      const body = await response.text();
      return { status: response.status, body };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new CatalogUnavailableError('BoardGameGeek did not respond in time.', {
          cause: error,
        });
      }
      throw new CatalogUnavailableError('Could not reach BoardGameGeek.', { cause: error });
    } finally {
      clearTimeout(timer);
    }
  }

  /** Request + status handling shared by the simple (non-202) endpoints. */
  private async requestXml(url: string): Promise<string> {
    const { status, body } = await this.enqueue(() => this.request(url));
    assertUsableStatus(status);
    return body;
  }

  // -------------------------------------------------------------------------
  // GameCatalogProvider
  // -------------------------------------------------------------------------

  async search(query: string, options: { limit?: number } = {}): Promise<CatalogSearchResult[]> {
    const trimmed = query.trim();
    if (trimmed.length === 0) return [];

    const url = this.buildUrl('search', {
      query: trimmed,
      type: 'boardgame,boardgameexpansion',
    });
    const xml = await this.requestXml(url);
    const results = parseSearchXml(xml);

    // BGG returns search hits unordered; put exact-ish matches first so the
    // obvious game is at the top of the list.
    const needle = trimmed.toLowerCase();
    results.sort((a, b) => {
      const aExact = a.name.toLowerCase() === needle ? 0 : a.name.toLowerCase().startsWith(needle) ? 1 : 2;
      const bExact = b.name.toLowerCase() === needle ? 0 : b.name.toLowerCase().startsWith(needle) ? 1 : 2;
      if (aExact !== bExact) return aExact - bExact;
      return (b.yearPublished ?? 0) - (a.yearPublished ?? 0);
    });

    return results.slice(0, options.limit ?? 25);
  }

  async getGames(bggIds: number[]): Promise<CatalogGame[]> {
    const ids = [...new Set(bggIds.filter((id) => Number.isInteger(id) && id > 0))];
    if (ids.length === 0) return [];

    const games: CatalogGame[] = [];
    for (let i = 0; i < ids.length; i += BGG_MAX_IDS_PER_REQUEST) {
      const batch = ids.slice(i, i + BGG_MAX_IDS_PER_REQUEST);
      const url = this.buildUrl('thing', { id: batch.join(','), stats: 1 });
      const xml = await this.requestXml(url);
      games.push(...parseThingsXml(xml));
    }
    return games;
  }

  async getCollection(username: string): Promise<CatalogCollectionItem[]> {
    const trimmed = username.trim();
    if (trimmed.length === 0) {
      throw new CatalogNotFoundError('A BoardGameGeek username is required.');
    }

    const url = this.buildUrl('collection', {
      username: trimmed,
      own: 1,
      stats: 1,
    });

    // BGG answers 202 while it builds the export, then 200 once it is ready.
    for (let attempt = 0; attempt <= COLLECTION_RETRY_DELAYS_MS.length; attempt += 1) {
      const { status, body } = await this.enqueue(() => this.request(url));

      if (status === 200) {
        return parseCollectionXml(body).filter((item) => item.owned);
      }
      if (status === 202) {
        const delay = COLLECTION_RETRY_DELAYS_MS[attempt];
        if (delay == null) break;
        await this.sleep(delay);
        continue;
      }
      if (status === 404) {
        throw new CatalogNotFoundError(
          `BoardGameGeek has no public collection for "${trimmed}".`,
        );
      }
      assertUsableStatus(status);
    }

    throw new CatalogUnavailableError(
      'BoardGameGeek is still preparing that collection. Try the import again in a minute.',
      { retryable: true },
    );
  }
}

function assertUsableStatus(status: number): void {
  if (status === 200) return;
  if (status === 429) {
    throw new CatalogUnavailableError(
      'BoardGameGeek is rate limiting us right now. Try again shortly.',
      { retryable: true },
    );
  }
  if (status === 202) {
    throw new CatalogUnavailableError('BoardGameGeek is still preparing that response.', {
      retryable: true,
    });
  }
  if (status >= 500) {
    throw new CatalogUnavailableError('BoardGameGeek is having trouble right now.', {
      retryable: true,
    });
  }
  throw new CatalogUnavailableError(`BoardGameGeek returned an unexpected status (${status}).`, {
    retryable: false,
  });
}
