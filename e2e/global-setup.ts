import { PrismaClient } from '@prisma/client';

/**
 * Clears the rate-limit counters before the suite runs.
 *
 * Sign-up and sign-in are rate limited per source address, and every browser in
 * the suite shares one. Resetting the window here keeps the limiter at its real
 * production strength while letting the suite run repeatedly.
 */
export default async function globalSetup(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await prisma.rateLimitHit.deleteMany();
  } finally {
    await prisma.$disconnect();
  }
}
