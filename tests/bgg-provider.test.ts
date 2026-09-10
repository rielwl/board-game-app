import { describe, expect, it, vi } from 'vitest';

import { CatalogNotFoundError, CatalogUnavailableError } from '@/domain/catalog/types';
import { BGG_MAX_IDS_PER_REQUEST, BggProvider } from '@/lib/bgg/provider';

import { COLLECTION_XML, SEARCH_XML, THING_XML } from './fixtures/bgg';

/** A provider with no real sleeping and no real network. */
function makeProvider(
  handler: (url: string, attempt: number) => { status: number; body: string },
  options: { minRequestIntervalMs?: number } = {},
) {
  const calls: string[] = [];
  const sleeps: number[] = [];

  const provider = new BggProvider({
    baseUrl: 'https://boardgamegeek.example/xmlapi2',
    userAgent: 'MeepleNight/test',
    minRequestIntervalMs: options.minRequestIntervalMs ?? 0,
    timeoutMs: 5000,
    fetchImpl: (async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      const { status, body } = handler(url, calls.filter((c) => c === url).length);
      return new Response(body, { status });
    }) as unknown as typeof fetch,
    sleepImpl: async (ms: number) => {
      sleeps.push(ms);
    },
  });

  return { provider, calls, sleeps };
}

describe('BggProvider.search', () => {
  it('hits the documented search endpoint and returns parsed results', async () => {
    const { provider, calls } = makeProvider(() => ({ status: 200, body: SEARCH_XML }));

    const results = await provider.search('catan');

    expect(calls[0]).toContain('/xmlapi2/search');
    expect(calls[0]).toContain('query=catan');
    expect(calls[0]).toContain('type=boardgame%2Cboardgameexpansion');
    expect(results.map((r) => r.bggId)).toEqual([13, 926]);
  });

  it('puts an exact name match first', async () => {
    const { provider } = makeProvider(() => ({ status: 200, body: SEARCH_XML }));
    const results = await provider.search('CATAN');
    expect(results[0]?.name).toBe('CATAN');
  });

  it('does not call out at all for an empty query', async () => {
    const { provider, calls } = makeProvider(() => ({ status: 200, body: SEARCH_XML }));
    expect(await provider.search('   ')).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe('BggProvider.getGames', () => {
  it('batches ids within the documented limit', async () => {
    const { provider, calls } = makeProvider(() => ({ status: 200, body: THING_XML }));

    const ids = Array.from({ length: BGG_MAX_IDS_PER_REQUEST + 5 }, (_, i) => i + 1);
    await provider.getGames(ids);

    expect(calls).toHaveLength(2);
    const firstBatch = new URL(calls[0]!).searchParams.get('id')!.split(',');
    const secondBatch = new URL(calls[1]!).searchParams.get('id')!.split(',');
    expect(firstBatch).toHaveLength(BGG_MAX_IDS_PER_REQUEST);
    expect(secondBatch).toHaveLength(5);
  });

  it('requests statistics so ratings and weights come back', async () => {
    const { provider, calls } = makeProvider(() => ({ status: 200, body: THING_XML }));
    await provider.getGames([13]);
    expect(new URL(calls[0]!).searchParams.get('stats')).toBe('1');
  });

  it('deduplicates and discards invalid ids', async () => {
    const { provider, calls } = makeProvider(() => ({ status: 200, body: THING_XML }));
    await provider.getGames([13, 13, 0, -5, Number.NaN, 926]);
    expect(new URL(calls[0]!).searchParams.get('id')).toBe('13,926');
  });

  it('makes no request for an empty id list', async () => {
    const { provider, calls } = makeProvider(() => ({ status: 200, body: THING_XML }));
    expect(await provider.getGames([])).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe('BggProvider.getCollection', () => {
  it('asks only for owned items and filters on the parsed status', async () => {
    const { provider, calls } = makeProvider(() => ({ status: 200, body: COLLECTION_XML }));

    const items = await provider.getCollection('demo');

    expect(new URL(calls[0]!).searchParams.get('own')).toBe('1');
    expect(new URL(calls[0]!).searchParams.get('username')).toBe('demo');
    // The wishlist row in the fixture must not survive.
    expect(items.map((item) => item.bggId)).toEqual([13, 30549]);
    expect(items.every((item) => item.owned)).toBe(true);
  });

  it('retries a 202 with bounded exponential backoff', async () => {
    let attempts = 0;
    const { provider, calls, sleeps } = makeProvider(() => {
      attempts += 1;
      return attempts < 3
        ? { status: 202, body: '<message>queued</message>' }
        : { status: 200, body: COLLECTION_XML };
    });

    const items = await provider.getCollection('demo');

    expect(calls).toHaveLength(3);
    expect(items).toHaveLength(2);
    // Delays must grow, not hammer.
    expect(sleeps).toEqual([2000, 4000]);
  });

  it('gives up on a permanently queued collection with a retryable error', async () => {
    const { provider, calls, sleeps } = makeProvider(() => ({
      status: 202,
      body: '<message>queued</message>',
    }));

    await expect(provider.getCollection('demo')).rejects.toThrow(CatalogUnavailableError);
    // Bounded: five backoff steps then one final attempt, and no more.
    expect(calls).toHaveLength(6);
    expect(sleeps).toEqual([2000, 4000, 8000, 16000, 30000]);
  });

  it('reports an unknown username distinctly from an outage', async () => {
    const { provider } = makeProvider(() => ({ status: 404, body: '' }));
    await expect(provider.getCollection('nobody')).rejects.toThrow(CatalogNotFoundError);
  });

  it('rejects an empty username before making a request', async () => {
    const { provider, calls } = makeProvider(() => ({ status: 200, body: COLLECTION_XML }));
    await expect(provider.getCollection('  ')).rejects.toThrow(CatalogNotFoundError);
    expect(calls).toHaveLength(0);
  });
});

describe('BggProvider failure handling', () => {
  it('translates a 429 into a retryable unavailable error', async () => {
    const { provider } = makeProvider(() => ({ status: 429, body: '' }));
    const error = await provider.search('catan').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CatalogUnavailableError);
    expect((error as CatalogUnavailableError).retryable).toBe(true);
    expect((error as Error).message).toMatch(/rate limit/i);
  });

  it('translates a 500 into a retryable unavailable error', async () => {
    const { provider } = makeProvider(() => ({ status: 503, body: '' }));
    const error = await provider.getGames([13]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CatalogUnavailableError);
    expect((error as CatalogUnavailableError).retryable).toBe(true);
  });

  it('marks an unexpected 4xx as not worth retrying', async () => {
    const { provider } = makeProvider(() => ({ status: 400, body: '' }));
    const error = await provider.search('catan').catch((e: unknown) => e);
    expect((error as CatalogUnavailableError).retryable).toBe(false);
  });

  it('turns a network failure into a CatalogUnavailableError', async () => {
    const provider = new BggProvider({
      baseUrl: 'https://boardgamegeek.example/xmlapi2',
      userAgent: 'MeepleNight/test',
      minRequestIntervalMs: 0,
      timeoutMs: 5000,
      fetchImpl: (async () => {
        throw new TypeError('fetch failed');
      }) as unknown as typeof fetch,
      sleepImpl: async () => {},
    });

    await expect(provider.search('catan')).rejects.toThrow(CatalogUnavailableError);
  });

  it('turns an aborted request into a timeout message', async () => {
    const provider = new BggProvider({
      baseUrl: 'https://boardgamegeek.example/xmlapi2',
      userAgent: 'MeepleNight/test',
      minRequestIntervalMs: 0,
      timeoutMs: 5000,
      fetchImpl: (async () => {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        throw error;
      }) as unknown as typeof fetch,
      sleepImpl: async () => {},
    });

    await expect(provider.search('catan')).rejects.toThrow(/did not respond in time/);
  });

  it('keeps serving later requests after one fails', async () => {
    let call = 0;
    const { provider } = makeProvider(() => {
      call += 1;
      return call === 1 ? { status: 500, body: '' } : { status: 200, body: SEARCH_XML };
    });

    await expect(provider.search('catan')).rejects.toThrow(CatalogUnavailableError);
    // The shared request queue must not be poisoned by the rejection.
    await expect(provider.search('catan')).resolves.toHaveLength(2);
  });
});

describe('outbound throttling', () => {
  it('serialises requests and waits between them', async () => {
    const { provider, sleeps } = makeProvider(() => ({ status: 200, body: SEARCH_XML }), {
      minRequestIntervalMs: 2000,
    });

    await Promise.all([provider.search('a'), provider.search('b'), provider.search('c')]);

    // The first call goes out immediately; the rest wait their turn.
    expect(sleeps.length).toBeGreaterThanOrEqual(2);
    expect(sleeps.every((ms) => ms > 0 && ms <= 2000)).toBe(true);
  });

  it('sends the configured contact User-Agent', async () => {
    const fetchSpy = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(SEARCH_XML, { status: 200 }),
    );
    const provider = new BggProvider({
      baseUrl: 'https://boardgamegeek.example/xmlapi2',
      userAgent: 'MeepleNight/0.1 (+https://example.com; hi@example.com)',
      minRequestIntervalMs: 0,
      timeoutMs: 5000,
      fetchImpl: fetchSpy as unknown as typeof fetch,
      sleepImpl: async () => {},
    });

    await provider.search('catan');

    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = init?.headers as Record<string, string>;
    expect(headers['User-Agent']).toContain('MeepleNight');
    expect(headers.Authorization).toBeUndefined();
  });

  it('sends the API token as a bearer header only when one is configured', async () => {
    const fetchSpy = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(SEARCH_XML, { status: 200 }),
    );
    const provider = new BggProvider({
      baseUrl: 'https://boardgamegeek.example/xmlapi2',
      userAgent: 'MeepleNight/test',
      apiToken: 'secret-token',
      minRequestIntervalMs: 0,
      timeoutMs: 5000,
      fetchImpl: fetchSpy as unknown as typeof fetch,
      sleepImpl: async () => {},
    });

    await provider.search('catan');

    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer secret-token');
    // The token must never leak into the URL, which gets logged.
    expect(String(fetchSpy.mock.calls[0]?.[0])).not.toContain('secret-token');
  });
});
