import 'server-only';

import { PrismaClient } from '@prisma/client';

/**
 * A single PrismaClient per process. Next.js dev mode re-evaluates modules on
 * every hot reload, so the instance is parked on globalThis to avoid opening a
 * new connection pool each time.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
