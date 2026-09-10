import 'server-only';

import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { nextCookies } from 'better-auth/next-js';

import { getEnv } from './env';
import { prisma } from './prisma';

const env = getEnv();

export const auth = betterAuth({
  appName: 'Meeple Night',
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,

  database: prismaAdapter(prisma, { provider: 'postgresql' }),

  emailAndPassword: {
    enabled: true,
    // Verification email delivery is out of scope for the MVP; accounts are
    // usable immediately. Password hashing uses Better Auth's scrypt defaults.
    requireEmailVerification: false,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    autoSignIn: true,
  },

  user: {
    additionalFields: {
      bggUsername: {
        type: 'string',
        required: false,
        input: false,
      },
    },
  },

  session: {
    // Database-backed sessions. The cookie only carries an opaque token.
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: false },
  },

  advanced: {
    useSecureCookies: env.NODE_ENV === 'production',
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: 'lax',
    },
  },

  // Coarse built-in limiter across all auth endpoints. Sign-in additionally
  // goes through the stricter per-identifier limiter in lib/rate-limit.ts.
  rateLimit: {
    enabled: true,
    window: 60,
    max: 30,
  },

  plugins: [nextCookies()],
});

export type Auth = typeof auth;
