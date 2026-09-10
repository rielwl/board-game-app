import 'server-only';

import { z } from 'zod';

/**
 * Server-only environment configuration.
 *
 * Importing this module from client code is a build error thanks to
 * `server-only`, which is the guarantee that secrets never reach the browser.
 */
const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((value) =>
    typeof value === 'boolean' ? value : ['1', 'true', 'yes', 'on'].includes(value.toLowerCase()),
  );

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  BETTER_AUTH_SECRET: z
    .string()
    .min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
  BETTER_AUTH_URL: z.url().default('http://localhost:3000'),

  INVITE_ENCRYPTION_KEY: z
    .string()
    .min(1, 'INVITE_ENCRYPTION_KEY is required (32 bytes, base64)'),

  BGG_ENABLED: booleanish.default(true),
  BGG_BASE_URL: z.url().default('https://boardgamegeek.com/xmlapi2'),
  BGG_API_TOKEN: z.string().optional(),
  BGG_USER_AGENT: z.string().default('MeepleNight/0.1 (+https://example.com)'),
  BGG_MIN_REQUEST_INTERVAL_MS: z.coerce.number().int().min(0).default(2000),
  BGG_TIMEOUT_MS: z.coerce.number().int().min(1000).default(15_000),
  BGG_CACHE_TTL_HOURS: z.coerce.number().min(0).default(168),

  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Invalid environment configuration. Copy .env.example to .env and fill it in.\n${issues}`,
    );
  }

  cached = parsed.data;
  return cached;
}

/** Public origin of the app, used to build invite links. */
export function appUrl(): string {
  return getEnv().BETTER_AUTH_URL.replace(/\/$/, '');
}
