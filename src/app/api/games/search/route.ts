import { NextResponse } from 'next/server';

import { getSessionUser } from '@/lib/authz';
import { consumeRateLimit } from '@/lib/rate-limit';
import { searchGames } from '@/server/games';

/**
 * Game search, used by the library's search box.
 *
 * It is a route handler rather than a server action because the client
 * fetches it as the user types. Sign-in is required so the endpoint cannot be
 * used as an anonymous proxy onto BoardGameGeek.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in to search for games.' }, { status: 401 });
  }

  const limit = await consumeRateLimit({
    bucket: 'game-search',
    key: user.id,
    limit: 60,
    windowSeconds: 60,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Slow down a moment, then search again.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  const query = new URL(request.url).searchParams.get('q') ?? '';
  if (query.trim().length < 2) {
    return NextResponse.json({ hits: [], catalogError: null });
  }

  const result = await searchGames(query, { limit: 15 });
  return NextResponse.json(result);
}
