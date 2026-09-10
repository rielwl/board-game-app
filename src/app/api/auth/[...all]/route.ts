import { toNextJsHandler } from 'better-auth/next-js';

import { auth } from '@/lib/auth';

// Better Auth needs Node APIs (crypto, Prisma), so this route is pinned to the
// Node.js runtime rather than the edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const { GET, POST } = toNextJsHandler(auth);
