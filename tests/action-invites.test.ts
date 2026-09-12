import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createPrismaMock } from './helpers/prisma-mock';

/**
 * Invite server actions.
 *
 * Invite links are the one way into a private event, so the interesting
 * assertions are the negative ones: an organizer of event A cannot revoke an
 * invite belonging to event B, and a signed-in user cannot grind through
 * tokens looking for a valid one.
 */

const prisma = createPrismaMock();
const requireUser = vi.fn();
const assertOrganizer = vi.fn();
const revalidatePath = vi.fn();
const consumeRateLimit = vi.fn();
const clientIpFrom = vi.fn((_headers: Headers) => '203.0.113.7');
const createInvite = vi.fn();
const redeemInvite = vi.fn();

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/auth', () => ({ auth: {} }));
vi.mock('@/lib/authz', async () => {
  const actual = await vi.importActual<typeof import('@/lib/authz')>('@/lib/authz');
  return {
    ...actual,
    requireUser: (to?: string) => requireUser(to),
    assertOrganizer: (eventId: string, userId: string) => assertOrganizer(eventId, userId),
  };
});
vi.mock('@/lib/rate-limit', () => ({
  consumeRateLimit: (options: unknown) => consumeRateLimit(options),
  clientIpFrom: (headers: Headers) => clientIpFrom(headers),
}));
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => revalidatePath(path) }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/server/invites', () => ({
  createInvite: (options: unknown) => createInvite(options),
  redeemInvite: (token: string, userId: string) => redeemInvite(token, userId),
}));

const { AuthorizationError } = await import('@/lib/authz');
const { createInviteAction, joinEventAction, revokeInviteAction } = await import(
  '@/server/actions/invites'
);
const { idleState } = await import('@/server/actions/state');

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

beforeEach(() => {
  prisma.reset();
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: 'u1', email: 'ada@example.com', name: 'Ada' });
  assertOrganizer.mockResolvedValue({ eventId: 'e1', userId: 'u1', role: 'ORGANIZER', isOrganizer: true });
  consumeRateLimit.mockResolvedValue({ allowed: true, remaining: 19, retryAfterSeconds: 1 });
});

describe('createInviteAction', () => {
  it('creates an invite attributed to the organizer who asked for it', async () => {
    createInvite.mockResolvedValue({ id: 'i1' });

    const state = await createInviteAction(
      idleState,
      form({ eventId: 'e1', expiresInDays: '7', maxUses: '10' }),
    );

    expect(createInvite).toHaveBeenCalledWith({
      eventId: 'e1',
      createdById: 'u1',
      expiresInDays: 7,
      maxUses: 10,
    });
    expect(state).toMatchObject({ status: 'success', message: 'New invite link created.' });
    expect(revalidatePath).toHaveBeenCalledWith('/events/e1/invite');
  });

  it('treats blank limits as "no limit"', async () => {
    createInvite.mockResolvedValue({ id: 'i1' });

    await createInviteAction(idleState, form({ eventId: 'e1', expiresInDays: '', maxUses: '' }));

    expect(createInvite).toHaveBeenCalledWith(
      expect.objectContaining({ expiresInDays: null, maxUses: null }),
    );
  });

  it('rejects an expiry outside the allowed range', async () => {
    const state = await createInviteAction(
      idleState,
      form({ eventId: 'e1', expiresInDays: '4000' }),
    );

    expect(state.status).toBe('error');
    expect(createInvite).not.toHaveBeenCalled();
  });

  it('refuses a non-organizer before any invite exists', async () => {
    assertOrganizer.mockRejectedValue(new AuthorizationError('Only the organizer can do that.'));

    const state = await createInviteAction(idleState, form({ eventId: 'e1' }));

    expect(state.message).toBe('Only the organizer can do that.');
    expect(createInvite).not.toHaveBeenCalled();
  });
});

describe('revokeInviteAction', () => {
  it('scopes the revocation to the organizer\'s own event', async () => {
    prisma.invite.updateMany.mockResolvedValue({ count: 1 });

    const state = await revokeInviteAction(idleState, form({ eventId: 'e1', inviteId: 'i1' }));

    const call = prisma.invite.updateMany.mock.calls[0]?.[0] as {
      where: { id: string; eventId: string; revokedAt: null };
    };
    // Without the eventId in the where clause, an organizer of any event
    // could revoke any invite whose id they could guess.
    expect(call.where).toEqual({ id: 'i1', eventId: 'e1', revokedAt: null });
    expect(state).toMatchObject({ status: 'success', message: 'Invite link revoked.' });
  });

  it('reports an already-revoked link rather than pretending to act', async () => {
    prisma.invite.updateMany.mockResolvedValue({ count: 0 });

    const state = await revokeInviteAction(idleState, form({ eventId: 'e1', inviteId: 'i1' }));

    expect(state).toMatchObject({
      status: 'error',
      message: 'That invite link is already revoked.',
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('refuses a non-organizer', async () => {
    assertOrganizer.mockRejectedValue(new AuthorizationError('Only the organizer can do that.'));

    const state = await revokeInviteAction(idleState, form({ eventId: 'e1', inviteId: 'i1' }));

    expect(state.status).toBe('error');
    expect(prisma.invite.updateMany).not.toHaveBeenCalled();
  });
});

describe('joinEventAction', () => {
  it('joins the event and welcomes a new member', async () => {
    redeemInvite.mockResolvedValue({ ok: true, eventId: 'e1', alreadyMember: false });

    const state = await joinEventAction(idleState, form({ token: 'tok' }));

    expect(redeemInvite).toHaveBeenCalledWith('tok', 'u1');
    expect(state).toMatchObject({
      status: 'success',
      message: 'Welcome — you have joined the event.',
    });
    expect(revalidatePath).toHaveBeenCalledWith('/events/e1');
  });

  it('is idempotent for someone who is already a member', async () => {
    redeemInvite.mockResolvedValue({ ok: true, eventId: 'e1', alreadyMember: true });

    const state = await joinEventAction(idleState, form({ token: 'tok' }));

    expect(state.message).toBe('You are already a member of this event.');
  });

  it('sends a signed-out visitor back to the invite page after signing in', async () => {
    redeemInvite.mockResolvedValue({ ok: true, eventId: 'e1', alreadyMember: false });

    await joinEventAction(idleState, form({ token: 'tok' }));

    expect(requireUser).toHaveBeenCalledWith('/invite/tok');
  });

  it('rate limits redemption per user and source address together', async () => {
    redeemInvite.mockResolvedValue({ ok: true, eventId: 'e1', alreadyMember: false });

    await joinEventAction(idleState, form({ token: 'tok' }));

    expect(consumeRateLimit).toHaveBeenCalledWith({
      bucket: 'invite-redeem',
      key: 'u1:203.0.113.7',
      limit: 20,
      windowSeconds: 300,
    });
  });

  it('stops token guessing once the limit is spent, without touching the invite', async () => {
    consumeRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 120 });

    const state = await joinEventAction(idleState, form({ token: 'tok' }));

    expect(state).toMatchObject({
      status: 'error',
      message: 'Too many invite attempts. Please wait a few minutes and try again.',
    });
    expect(redeemInvite).not.toHaveBeenCalled();
  });

  it('passes a redemption refusal straight through to the form', async () => {
    redeemInvite.mockResolvedValue({ ok: false, message: 'This invite link has expired.' });

    const state = await joinEventAction(idleState, form({ token: 'tok' }));

    expect(state).toMatchObject({ status: 'error', message: 'This invite link has expired.' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
