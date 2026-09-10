import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Authorization tests.
 *
 * Prisma is mocked so these run without a database. What is under test is the
 * decision logic — who is allowed to do what — not the SQL. The mock records
 * the `where` clauses each call made, which is how the "scoped by owner"
 * assertions below can prove a query could not touch another user's row.
 */

const findUniqueEventMember = vi.fn();
const notFoundSpy = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});
const redirectSpy = vi.fn((to: string) => {
  throw new Error(`NEXT_REDIRECT:${to}`);
});
const getSessionSpy = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    eventMember: { findUnique: findUniqueEventMember },
  },
}));

vi.mock('next/navigation', () => ({
  notFound: () => notFoundSpy(),
  redirect: (to: string) => redirectSpy(to),
}));

vi.mock('next/headers', () => ({
  headers: async () => new Headers(),
}));

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: (...args: unknown[]) => getSessionSpy(...args) } },
}));

const { AuthorizationError, assertMember, assertOrganizer, getMembership, getSessionUser, requireUser } =
  await import('@/lib/authz');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getSessionUser', () => {
  it('returns null when there is no session', async () => {
    getSessionSpy.mockResolvedValue(null);
    expect(await getSessionUser()).toBeNull();
  });

  it('returns only the fields the app needs, never the whole session', async () => {
    getSessionSpy.mockResolvedValue({
      user: {
        id: 'u1',
        email: 'ada@example.com',
        name: 'Ada',
        // Anything else on the session object must not be passed along.
        secretInternalFlag: true,
      },
      session: { token: 'super-secret-session-token' },
    });

    const user = await getSessionUser();
    expect(user).toEqual({ id: 'u1', email: 'ada@example.com', name: 'Ada' });
    expect(JSON.stringify(user)).not.toContain('super-secret-session-token');
  });
});

describe('requireUser', () => {
  it('redirects an anonymous visitor to sign-in, preserving where they were going', async () => {
    getSessionSpy.mockResolvedValue(null);

    await expect(requireUser('/events/abc/tonight')).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectSpy).toHaveBeenCalledWith('/sign-in?next=%2Fevents%2Fabc%2Ftonight');
  });

  it('does not redirect a signed-in user', async () => {
    getSessionSpy.mockResolvedValue({ user: { id: 'u1', email: 'a@b.c', name: 'Ada' } });

    await expect(requireUser('/dashboard')).resolves.toMatchObject({ id: 'u1' });
    expect(redirectSpy).not.toHaveBeenCalled();
  });
});

describe('getMembership', () => {
  it('looks the caller up by the composite (eventId, userId) key', async () => {
    findUniqueEventMember.mockResolvedValue({
      eventId: 'e1',
      userId: 'u1',
      role: 'ATTENDEE',
    });

    await getMembership('e1', 'u1');

    expect(findUniqueEventMember).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventId_userId: { eventId: 'e1', userId: 'u1' } },
      }),
    );
  });

  it('returns null for a non-member', async () => {
    findUniqueEventMember.mockResolvedValue(null);
    expect(await getMembership('e1', 'stranger')).toBeNull();
  });

  it('flags the organizer role', async () => {
    findUniqueEventMember.mockResolvedValue({
      eventId: 'e1',
      userId: 'u1',
      role: 'ORGANIZER',
    });
    expect(await getMembership('e1', 'u1')).toMatchObject({ isOrganizer: true });
  });
});

describe('assertMember', () => {
  it('allows a member through', async () => {
    findUniqueEventMember.mockResolvedValue({ eventId: 'e1', userId: 'u1', role: 'ATTENDEE' });
    await expect(assertMember('e1', 'u1')).resolves.toMatchObject({ isOrganizer: false });
  });

  it('rejects a non-member with a 404, not a 403', async () => {
    // A 403 would confirm the event exists. A 404 keeps private events
    // indistinguishable from ids that were never real.
    findUniqueEventMember.mockResolvedValue(null);

    const error = await assertMember('e1', 'stranger').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AuthorizationError);
    expect((error as { status: number }).status).toBe(404);
    expect((error as Error).message).not.toContain('permission');
  });
});

describe('assertOrganizer', () => {
  it('allows the organizer', async () => {
    findUniqueEventMember.mockResolvedValue({ eventId: 'e1', userId: 'u1', role: 'ORGANIZER' });
    await expect(assertOrganizer('e1', 'u1')).resolves.toMatchObject({ isOrganizer: true });
  });

  it('rejects an attendee with a 403', async () => {
    findUniqueEventMember.mockResolvedValue({ eventId: 'e1', userId: 'u2', role: 'ATTENDEE' });

    const error = await assertOrganizer('e1', 'u2').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AuthorizationError);
    expect((error as { status: number }).status).toBe(403);
  });

  it('rejects a complete stranger with a 404 before it ever checks the role', async () => {
    findUniqueEventMember.mockResolvedValue(null);

    const error = await assertOrganizer('e1', 'stranger').catch((e: unknown) => e);
    expect((error as { status: number }).status).toBe(404);
  });

  it('does not accept an organizer of a different event', async () => {
    // The query is keyed on both ids, so a membership elsewhere returns null
    // for this event and the caller is refused.
    findUniqueEventMember.mockImplementation(
      async ({ where }: { where: { eventId_userId: { eventId: string; userId: string } } }) =>
        where.eventId_userId.eventId === 'other-event'
          ? { eventId: 'other-event', userId: 'u1', role: 'ORGANIZER' }
          : null,
    );

    await expect(assertOrganizer('e1', 'u1')).rejects.toThrow(AuthorizationError);
    await expect(assertOrganizer('other-event', 'u1')).resolves.toMatchObject({
      isOrganizer: true,
    });
  });
});
