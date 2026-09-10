import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Invite token handling: validity rules, safe re-joining, and the guarantee
 * that a plaintext token is never what the database stores.
 */

process.env.DATABASE_URL ??= 'postgresql://localhost:5432/test';
process.env.BETTER_AUTH_SECRET ??= 'test-secret-that-is-at-least-32-characters-long';
process.env.BETTER_AUTH_URL ??= 'http://localhost:3000';
process.env.INVITE_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64');

const inviteFindUnique = vi.fn();
const inviteCreate = vi.fn();
const memberFindUnique = vi.fn();
const memberCreate = vi.fn();
const inviteUpdate = vi.fn();
const transaction = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    invite: { findUnique: inviteFindUnique, create: inviteCreate, update: inviteUpdate },
    eventMember: { findUnique: memberFindUnique, create: memberCreate },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => transaction(fn),
  },
}));

const { checkInvite, createInvite, redeemInvite, toInviteView } = await import('@/server/invites');
const { hashToken, decryptSecret } = await import('@/lib/crypto');

beforeEach(() => {
  vi.resetAllMocks();
  transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      invite: { findUnique: inviteFindUnique, update: inviteUpdate },
      eventMember: { create: memberCreate },
    }),
  );
});

const activeInvite = (overrides: Record<string, unknown> = {}) => ({
  id: 'inv1',
  eventId: 'e1',
  revokedAt: null,
  expiresAt: null,
  maxUses: null,
  useCount: 0,
  event: { status: 'ACTIVE' },
  ...overrides,
});

describe('createInvite', () => {
  it('stores a hash for lookup and a ciphertext for re-display, never the raw token', async () => {
    inviteCreate.mockImplementation(async ({ data }: { data: Record<string, string> }) => ({
      ...data,
      id: 'inv1',
      createdAt: new Date(),
      expiresAt: data.expiresAt ?? null,
      revokedAt: null,
      maxUses: null,
      useCount: 0,
    }));

    const view = await createInvite({
      eventId: 'e1',
      createdById: 'u1',
      expiresInDays: null,
      maxUses: null,
    });

    const stored = inviteCreate.mock.calls[0]![0].data as {
      tokenHash: string;
      tokenCipher: string;
    };

    const token = view.url!.split('/').pop()!;
    // The token is long and URL-safe.
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);

    // Neither stored column contains the token in the clear.
    expect(stored.tokenHash).not.toContain(token);
    expect(stored.tokenCipher).not.toContain(token);
    // But the hash is the deterministic lookup key for it.
    expect(stored.tokenHash).toBe(hashToken(token));
    // And the ciphertext round-trips, which is what lets the organizer re-copy.
    expect(decryptSecret(stored.tokenCipher)).toBe(token);
  });

  it('generates a different token every time', async () => {
    inviteCreate.mockImplementation(async ({ data }: { data: Record<string, string> }) => ({
      ...data,
      id: 'inv',
      createdAt: new Date(),
      expiresAt: null,
      revokedAt: null,
      maxUses: null,
      useCount: 0,
    }));

    const first = await createInvite({ eventId: 'e1', createdById: 'u1', expiresInDays: null, maxUses: null });
    const second = await createInvite({ eventId: 'e1', createdById: 'u1', expiresInDays: null, maxUses: null });

    expect(first.url).not.toBe(second.url);
  });

  it('turns an expiry in days into a concrete date', async () => {
    inviteCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...data,
      id: 'inv1',
      createdAt: new Date(),
      revokedAt: null,
      maxUses: null,
      useCount: 0,
    }));

    await createInvite({ eventId: 'e1', createdById: 'u1', expiresInDays: 7, maxUses: 3 });

    const data = inviteCreate.mock.calls[0]![0].data as { expiresAt: Date; maxUses: number };
    const days = (data.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
    expect(data.maxUses).toBe(3);
  });
});

describe('checkInvite', () => {
  it('looks the token up by hash, never by the token itself', async () => {
    inviteFindUnique.mockResolvedValue(activeInvite());
    await checkInvite('some-token');

    expect(inviteFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash: hashToken('some-token') } }),
    );
  });

  it('accepts a live invite', async () => {
    inviteFindUnique.mockResolvedValue(activeInvite());
    await expect(checkInvite('t')).resolves.toMatchObject({ ok: true, eventId: 'e1' });
  });

  it('rejects an unknown token', async () => {
    inviteFindUnique.mockResolvedValue(null);
    await expect(checkInvite('t')).resolves.toMatchObject({ ok: false, reason: 'NOT_FOUND' });
  });

  it('rejects a revoked invite', async () => {
    inviteFindUnique.mockResolvedValue(activeInvite({ revokedAt: new Date() }));
    await expect(checkInvite('t')).resolves.toMatchObject({ ok: false, reason: 'REVOKED' });
  });

  it('rejects an expired invite', async () => {
    inviteFindUnique.mockResolvedValue(
      activeInvite({ expiresAt: new Date(Date.now() - 1000) }),
    );
    await expect(checkInvite('t')).resolves.toMatchObject({ ok: false, reason: 'EXPIRED' });
  });

  it('accepts an invite that has not expired yet', async () => {
    inviteFindUnique.mockResolvedValue(
      activeInvite({ expiresAt: new Date(Date.now() + 60_000) }),
    );
    await expect(checkInvite('t')).resolves.toMatchObject({ ok: true });
  });

  it('rejects an invite that has hit its use limit', async () => {
    inviteFindUnique.mockResolvedValue(activeInvite({ maxUses: 2, useCount: 2 }));
    await expect(checkInvite('t')).resolves.toMatchObject({ ok: false, reason: 'EXHAUSTED' });
  });

  it('rejects an invite to a cancelled event', async () => {
    inviteFindUnique.mockResolvedValue(activeInvite({ event: { status: 'CANCELLED' } }));
    await expect(checkInvite('t')).resolves.toMatchObject({ ok: false, reason: 'CLOSED' });
  });
});

describe('redeemInvite', () => {
  it('adds a new member and counts the use', async () => {
    inviteFindUnique.mockResolvedValue(activeInvite());
    memberFindUnique.mockResolvedValue(null);

    const result = await redeemInvite('t', 'u2');

    expect(result).toMatchObject({ ok: true, alreadyMember: false, eventId: 'e1' });
    expect(memberCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: 'ATTENDEE', rsvp: 'AWAITING' }),
      }),
    );
    expect(inviteUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { useCount: { increment: 1 } } }),
    );
  });

  it('is safe to redeem twice: no duplicate member, no extra use burned', async () => {
    inviteFindUnique.mockResolvedValue(activeInvite({ maxUses: 1, useCount: 1 }));
    memberFindUnique.mockResolvedValue({ id: 'm1' });

    const result = await redeemInvite('t', 'u2');

    expect(result).toMatchObject({ ok: true, alreadyMember: true });
    expect(memberCreate).not.toHaveBeenCalled();
    expect(inviteUpdate).not.toHaveBeenCalled();
  });

  it('does not create a membership for a revoked invite', async () => {
    inviteFindUnique.mockResolvedValue(activeInvite({ revokedAt: new Date() }));
    memberFindUnique.mockResolvedValue(null);

    await expect(redeemInvite('t', 'u2')).resolves.toMatchObject({ ok: false });
    expect(memberCreate).not.toHaveBeenCalled();
  });

  it('re-checks the use count inside the transaction against a race', async () => {
    // Resolving the token and validating it both see room; by the time the
    // transaction reads the row, a concurrent redemption has taken the last slot.
    inviteFindUnique
      .mockResolvedValueOnce(activeInvite({ maxUses: 1, useCount: 0 }))
      .mockResolvedValueOnce(activeInvite({ maxUses: 1, useCount: 0 }))
      .mockResolvedValueOnce({ maxUses: 1, useCount: 1, revokedAt: null });
    memberFindUnique.mockResolvedValue(null);

    const result = await redeemInvite('t', 'u2');

    expect(result).toMatchObject({ ok: false });
    expect((result as { message: string }).message).toContain('usage limit');
    expect(memberCreate).not.toHaveBeenCalled();
  });

  it('treats a lost race that already created the membership as a success', async () => {
    inviteFindUnique.mockResolvedValue(activeInvite());
    // Nothing on the pre-check, a unique violation in the transaction, and by
    // the time we look again the concurrent request has created the row.
    memberFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'm1' });
    transaction.mockRejectedValue(new Error('Unique constraint failed'));

    await expect(redeemInvite('t', 'u2')).resolves.toMatchObject({
      ok: true,
      alreadyMember: true,
    });
  });
});

describe('toInviteView', () => {
  it('reports a link as unrecoverable when the ciphertext will not decrypt', () => {
    const view = toInviteView({
      id: 'inv1',
      eventId: 'e1',
      tokenHash: 'hash',
      tokenCipher: 'not-a-valid-ciphertext',
      expiresAt: null,
      revokedAt: null,
      maxUses: null,
      useCount: 0,
      createdById: 'u1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(view.linkRecoverable).toBe(false);
    expect(view.url).toBeNull();
  });
});
