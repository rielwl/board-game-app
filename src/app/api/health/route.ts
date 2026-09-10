import { NextResponse } from 'next/server';

import { getEnv } from '@/lib/env';
import { prisma } from '@/lib/prisma';

/**
 * Deployment health check.
 *
 * Railway (and most hosts) polls this before routing traffic to a new
 * release, so it deliberately fails when the app could not actually serve a
 * request: a missing secret or an unreachable database should stop a bad
 * deploy rather than produce a site that 500s on every page.
 *
 * It reports names, never values. `getEnv()` errors list which variables are
 * wrong, which is what you need while setting a host up, and nothing more.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type CheckResult = { ok: boolean; detail?: string };

async function checkDatabase(): Promise<CheckResult> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch (error) {
    // The connection string can contain a password, so the message is fixed
    // text rather than anything derived from the driver error.
    console.error('[health] database check failed', error);
    return { ok: false, detail: 'Could not reach the database.' };
  }
}

function checkEnv(): CheckResult {
  try {
    getEnv();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : 'Invalid configuration.',
    };
  }
}

export async function GET(): Promise<NextResponse> {
  const env = checkEnv();
  // Only worth trying the database once the connection string has been validated.
  const database = env.ok ? await checkDatabase() : { ok: false, detail: 'Not checked.' };

  const healthy = env.ok && database.ok;

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'unhealthy',
      checks: {
        env: env.ok ? 'ok' : env.detail,
        database: database.ok ? 'ok' : database.detail,
      },
    },
    {
      status: healthy ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
