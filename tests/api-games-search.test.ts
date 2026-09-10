import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Route handler tests for `GET /api/games/search`.
 *
 * The handler is thin by design, so what is worth pinning down is the order of
 * its gates: authentication before rate limiting, rate limiting before any
 * catalog work, and the short-query shortcut before the provider is asked
 * anything at all.
 */

const getSessionUser = vi.fn();
const consumeRateLimit = vi.fn();
const searchGames = vi.fn();

vi.mock('@/lib/authz', () => ({
  getSessionUser: () => getSessionUser(),
}));

vi.mock('@/lib/rate-limit', () => ({
  consumeRateLimit: (options: unknown) => consumeRateLimit(options),
}));

vi.mock('@/server/games', () => ({
  searchGames: (query: string, options: unknown) => searchGames(query, options),
}));

const { GET } = await import('@/app/api/games/search/route');

const allowed = { allowed: true, remaining: 59, retryAfterSeconds: 1 };

function request(query: string): Request {
  return new Request(`https://example.test/api/games/search?q=${encodeURIComponent(query)}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUser.mockResolvedValue({ id: 'u1', email: 'ada@example.com', name: 'Ada' });
  consumeRateLimit.mockResolvedValue(allowed);
  searchGames.mockResolvedValue({ hits: [], catalogError: null, providerId: 'fixture' });
});

describe('authentication', () => {
  it('rejects an anonymous caller with 401', async () => {
    getSessionUser.mockResolvedValue(null);

    const response = await GET(request('catan'));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Sign in to search for games.' });
  });

  it('does not spend rate-limit budget or touch the catalog when signed out', async () => {
    getSessionUser.mockResolvedValue(null);

    await GET(request('catan'));

    expect(consumeRateLimit).not.toHaveBeenCalled();
    expect(searchGames).not.toHaveBeenCalled();
  });
});

describe('rate limiting', () => {
  it('is keyed by user id, not by IP, so one user cannot exhaust another', async () => {
    await GET(request('catan'));

    expect(consumeRateLimit).toHaveBeenCalledWith({
      bucket: 'game-search',
      key: 'u1',
      limit: 60,
      windowSeconds: 60,
    });
  });

  it('returns 429 with a Retry-After header once the window is spent', async () => {
    consumeRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 37 });

    const response = await GET(request('catan'));

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('37');
    await expect(response.json()).resolves.toEqual({
      error: 'Slow down a moment, then search again.',
    });
  });

  it('does not run a search that was rate limited', async () => {
    consumeRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 5 });

    await GET(request('catan'));

    expect(searchGames).not.toHaveBeenCalled();
  });
});

describe('query handling', () => {
  it('returns an empty result for a one-character query without asking the catalog', async () => {
    const response = await GET(request('c'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ hits: [], catalogError: null });
    expect(searchGames).not.toHaveBeenCalled();
  });

  it('treats a whitespace-only query as too short', async () => {
    const response = await GET(request('   '));

    expect(response.status).toBe(200);
    expect(searchGames).not.toHaveBeenCalled();
  });

  it('treats a missing q parameter as too short rather than erroring', async () => {
    const response = await GET(new Request('https://example.test/api/games/search'));

    expect(response.status).toBe(200);
    expect(searchGames).not.toHaveBeenCalled();
  });

  it('searches once the query reaches two characters', async () => {
    await GET(request('ca'));

    expect(searchGames).toHaveBeenCalledWith('ca', { limit: 15 });
  });

  it('passes the raw query through; trimming is the search layer\'s job', async () => {
    await GET(request('  catan  '));

    expect(searchGames).toHaveBeenCalledWith('  catan  ', { limit: 15 });
  });
});

describe('responses', () => {
  it('returns the search result verbatim', async () => {
    const result = {
      hits: [
        {
          id: 'g1',
          bggId: 13,
          name: 'Catan',
          yearPublished: 1995,
          isExpansion: false,
          thumbnailUrl: null,
          source: 'local',
        },
      ],
      catalogError: null,
      providerId: 'bgg',
    };
    searchGames.mockResolvedValue(result);

    const response = await GET(request('catan'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(result);
  });

  it('still returns 200 when the catalog is down, so local hits survive', async () => {
    searchGames.mockResolvedValue({
      hits: [],
      catalogError: 'BoardGameGeek is unavailable right now.',
      providerId: 'bgg',
    });

    const response = await GET(request('catan'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      catalogError: 'BoardGameGeek is unavailable right now.',
    });
  });
});
