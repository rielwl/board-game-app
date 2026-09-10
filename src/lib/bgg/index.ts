import 'server-only';

import { FixtureCatalogProvider } from '@/domain/catalog/fixture-provider';
import type { GameCatalogProvider } from '@/domain/catalog/types';

import { getEnv } from '../env';
import { BggProvider } from './provider';

let cached: GameCatalogProvider | null = null;

/**
 * Chooses the catalog provider for this process.
 *
 * BGG_ENABLED=false swaps in the offline fixture provider, so the app runs
 * end to end without any outbound network access. Both providers satisfy the
 * same interface, so nothing above this line knows which one it is talking to.
 */
export function getCatalogProvider(): GameCatalogProvider {
  if (cached) return cached;

  const env = getEnv();
  cached = env.BGG_ENABLED
    ? new BggProvider({
        baseUrl: env.BGG_BASE_URL,
        userAgent: env.BGG_USER_AGENT,
        apiToken: env.BGG_API_TOKEN || undefined,
        minRequestIntervalMs: env.BGG_MIN_REQUEST_INTERVAL_MS,
        timeoutMs: env.BGG_TIMEOUT_MS,
      })
    : new FixtureCatalogProvider();

  return cached;
}

/** Test seam. */
export function __setCatalogProvider(provider: GameCatalogProvider | null): void {
  cached = provider;
}

export { BggProvider } from './provider';
