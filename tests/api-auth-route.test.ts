import { describe, expect, it, vi } from 'vitest';

/**
 * The Better Auth catch-all route.
 *
 * The handler itself belongs to Better Auth, so what is worth asserting is the
 * wiring: both verbs are exported, they are the handlers built from *this*
 * app's auth instance, and the segment stays on the Node.js runtime — Better
 * Auth needs Node crypto and Prisma, and an accidental edge deployment would
 * only fail once it was live.
 */

const auth = { api: {} };
const toNextJsHandler = vi.fn((_instance: unknown) => ({
  GET: async (_request: Request) => new Response('get'),
  POST: async (_request: Request) => new Response('post'),
}));

vi.mock('@/lib/auth', () => ({ auth }));
vi.mock('better-auth/next-js', () => ({
  toNextJsHandler: (instance: unknown) => toNextJsHandler(instance),
}));

const route = await import('@/app/api/auth/[...all]/route');

describe('auth route', () => {
  it('builds its handlers from the app auth instance', () => {
    expect(toNextJsHandler).toHaveBeenCalledWith(auth);
  });

  it('exports both verbs Better Auth needs', async () => {
    expect(typeof route.GET).toBe('function');
    expect(typeof route.POST).toBe('function');
    const request = new Request('https://example.test/api/auth/session');
    await expect((await route.GET(request)).text()).resolves.toBe('get');
    await expect((await route.POST(request)).text()).resolves.toBe('post');
  });

  it('pins the segment to the Node.js runtime and opts out of caching', () => {
    expect(route.runtime).toBe('nodejs');
    expect(route.dynamic).toBe('force-dynamic');
  });
});
