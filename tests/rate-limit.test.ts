import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPrismaMock } from './helpers/prisma-mock';

/**
 * The database-backed fixed-window rate limiter.
 *
 * The window key is what makes the limiter work across processes, so the
 * tests pin down how an instant maps to a window, and what happens on the two
 * failure paths the implementation cares about: a racing upsert, and a
 * database that will not answer at all.
 */

const prisma = createPrismaMock();

vi.mock('@/lib/prisma', () => ({ prisma }));

const { clientIpFrom, consumeRateLimit } = await import('@/lib/rate-limit');

const options = { bucket: 'sign-in', key: 'ada@example.com', limit: 3, windowSeconds: 60 };

beforeEach(() => {
  prisma.reset();
  vi.clearAllMocks();
  // A random draw above the 2% cleanup threshold keeps the opportunistic
  // delete out of the way unless a test asks for it.
  vi.spyOn(Math, 'random').mockReturnValue(0.9);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('consumeRateLimit', () => {
  it('allows a call below the limit and reports what is left', async () => {
    prisma.rateLimitHit.upsert.mockResolvedValue({ count: 1 });

    await expect(consumeRateLimit(options)).resolves.toMatchObject({
      allowed: true,
      remaining: 2,
    });
  });

  it('allows the call that exactly reaches the limit', async () => {
    prisma.rateLimitHit.upsert.mockResolvedValue({ count: 3 });

    await expect(consumeRateLimit(options)).resolves.toMatchObject({
      allowed: true,
      remaining: 0,
    });
  });

  it('refuses the call after the limit, and never reports negative remaining', async () => {
    prisma.rateLimitHit.upsert.mockResolvedValue({ count: 9 });

    await expect(consumeRateLimit(options)).resolves.toMatchObject({
      allowed: false,
      remaining: 0,
    });
  });

  it('increments an existing window rather than resetting it', async () => {
    prisma.rateLimitHit.upsert.mockResolvedValue({ count: 2 });

    await consumeRateLimit(options);

    const call = prisma.rateLimitHit.upsert.mock.calls[0]?.[0] as {
      create: { count: number };
      update: { count: { increment: number } };
    };
    expect(call.create.count).toBe(1);
    expect(call.update).toEqual({ count: { increment: 1 } });
  });

  it('puts two calls inside the same minute in the same window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-10T12:00:05Z'));
    prisma.rateLimitHit.upsert.mockResolvedValue({ count: 1 });
    await consumeRateLimit(options);

    vi.setSystemTime(new Date('2026-09-10T12:00:55Z'));
    await consumeRateLimit(options);

    expect(prisma.rateLimitHit.upsert).toHaveBeenCalledTimes(2);
    const [first, second] = prisma.rateLimitHit.upsert.mock.calls.map(
      (call) => (call[0] as { where: { bucket_windowKey: { windowKey: string } } }).where,
    );
    expect(first?.bucket_windowKey.windowKey).toBe(second?.bucket_windowKey.windowKey);
  });

  it('starts a fresh window once the boundary is crossed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-10T12:00:55Z'));
    prisma.rateLimitHit.upsert.mockResolvedValue({ count: 1 });
    await consumeRateLimit(options);

    vi.setSystemTime(new Date('2026-09-10T12:01:05Z'));
    await consumeRateLimit(options);

    expect(prisma.rateLimitHit.upsert).toHaveBeenCalledTimes(2);
    const [first, second] = prisma.rateLimitHit.upsert.mock.calls.map(
      (call) => (call[0] as { where: { bucket_windowKey: { windowKey: string } } }).where,
    );
    expect(first?.bucket_windowKey.windowKey).not.toBe(second?.bucket_windowKey.windowKey);
  });

  it('keys the window by caller, so two users do not share a budget', async () => {
    prisma.rateLimitHit.upsert.mockResolvedValue({ count: 1 });

    await consumeRateLimit(options);
    await consumeRateLimit({ ...options, key: 'grace@example.com' });

    expect(prisma.rateLimitHit.upsert).toHaveBeenCalledTimes(2);
    const [first, second] = prisma.rateLimitHit.upsert.mock.calls.map(
      (call) => (call[0] as { where: { bucket_windowKey: { windowKey: string } } }).where,
    );
    expect(first?.bucket_windowKey.windowKey).not.toBe(second?.bucket_windowKey.windowKey);
  });

  it('reports how long is left in the window, rounded up', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-10T12:00:30Z'));
    prisma.rateLimitHit.upsert.mockResolvedValue({ count: 9 });

    const result = await consumeRateLimit(options);

    expect(result.retryAfterSeconds).toBe(30);
  });

  it('never advertises a retry of zero seconds', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-10T12:01:00.000Z'));
    prisma.rateLimitHit.upsert.mockResolvedValue({ count: 9 });

    const result = await consumeRateLimit(options);

    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it('re-reads the row when a concurrent upsert collides', async () => {
    prisma.rateLimitHit.upsert.mockRejectedValue(new Error('unique constraint'));
    prisma.rateLimitHit.findUnique.mockResolvedValue({ count: 9 });

    await expect(consumeRateLimit(options)).resolves.toMatchObject({ allowed: false });
  });

  it('fails open rather than locking a user out when the database is unreachable', async () => {
    prisma.rateLimitHit.upsert.mockRejectedValue(new Error('connection refused'));
    prisma.rateLimitHit.findUnique.mockRejectedValue(new Error('connection refused'));

    await expect(consumeRateLimit(options)).resolves.toMatchObject({ allowed: true });
  });

  it('sweeps expired rows occasionally, without waiting for the delete', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.001);
    prisma.rateLimitHit.upsert.mockResolvedValue({ count: 1 });
    prisma.rateLimitHit.deleteMany.mockResolvedValue({ count: 5 });

    await consumeRateLimit(options);

    expect(prisma.rateLimitHit.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: expect.any(Date) } },
    });
  });

  it('does not sweep on most calls', async () => {
    prisma.rateLimitHit.upsert.mockResolvedValue({ count: 1 });

    await consumeRateLimit(options);

    expect(prisma.rateLimitHit.deleteMany).not.toHaveBeenCalled();
  });

  it('survives a failing sweep', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.001);
    prisma.rateLimitHit.upsert.mockResolvedValue({ count: 1 });
    prisma.rateLimitHit.deleteMany.mockRejectedValue(new Error('deadlock'));

    await expect(consumeRateLimit(options)).resolves.toMatchObject({ allowed: true });
  });
});

describe('clientIpFrom', () => {
  it('takes the first entry of x-forwarded-for, which is the original client', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18, 150.172.238.178' });

    expect(clientIpFrom(headers)).toBe('203.0.113.7');
  });

  it('trims whitespace around the address', () => {
    expect(clientIpFrom(new Headers({ 'x-forwarded-for': '  203.0.113.7  ' }))).toBe('203.0.113.7');
  });

  it('falls back to x-real-ip', () => {
    expect(clientIpFrom(new Headers({ 'x-real-ip': '203.0.113.9' }))).toBe('203.0.113.9');
  });

  it('prefers x-forwarded-for over x-real-ip', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.7', 'x-real-ip': '203.0.113.9' });

    expect(clientIpFrom(headers)).toBe('203.0.113.7');
  });

  it('falls through to x-real-ip when x-forwarded-for is empty', () => {
    const headers = new Headers({ 'x-forwarded-for': '  ', 'x-real-ip': '203.0.113.9' });

    expect(clientIpFrom(headers)).toBe('203.0.113.9');
  });

  it('returns a stable placeholder when there is nothing to go on', () => {
    expect(clientIpFrom(new Headers())).toBe('unknown');
  });
});
