import 'server-only';

import { prisma } from './prisma';

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

/**
 * Database-backed fixed-window rate limiter.
 *
 * Deliberately simple: one row per (bucket, window). It is not a sliding
 * window and it is not distributed-lock-free-perfect, but it survives process
 * restarts and is enough to blunt credential stuffing on a single-table app.
 */
export async function consumeRateLimit(options: {
  bucket: string;
  key: string;
  limit: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  const { bucket, key, limit, windowSeconds } = options;

  const now = Date.now();
  const windowStart = Math.floor(now / (windowSeconds * 1000)) * windowSeconds * 1000;
  const windowKey = `${key}:${windowStart}`;
  const expiresAt = new Date(windowStart + windowSeconds * 1000);
  const retryAfterSeconds = Math.max(1, Math.ceil((expiresAt.getTime() - now) / 1000));

  let count: number;
  try {
    const row = await prisma.rateLimitHit.upsert({
      where: { bucket_windowKey: { bucket, windowKey } },
      create: { bucket, windowKey, count: 1, expiresAt },
      update: { count: { increment: 1 } },
    });
    count = row.count;
  } catch {
    // A racing upsert can collide on the unique index. Re-read; if that also
    // fails, fail open rather than locking legitimate users out.
    const row = await prisma.rateLimitHit
      .findUnique({ where: { bucket_windowKey: { bucket, windowKey } } })
      .catch(() => null);
    count = row?.count ?? 1;
  }

  // Opportunistic cleanup, roughly 1 call in 50.
  if (Math.random() < 0.02) {
    void prisma.rateLimitHit
      .deleteMany({ where: { expiresAt: { lt: new Date() } } })
      .catch(() => undefined);
  }

  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds,
  };
}

/** Best-effort client identifier from proxy headers. */
export function clientIpFrom(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip')?.trim() || 'unknown';
}
