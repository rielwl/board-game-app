import 'server-only';

import type { Invite } from '@prisma/client';

import { decryptSecret, encryptSecret, generateToken, hashToken } from '@/lib/crypto';
import { appUrl } from '@/lib/env';
import { prisma } from '@/lib/prisma';

/**
 * Invite links.
 *
 * The token is 32 random bytes, so guessing one is not a realistic attack. The
 * database stores its SHA-256 (the lookup key) and an AES-256-GCM ciphertext
 * of the token, so an organizer can re-copy the link but a leaked dump does
 * not directly hand out working invites.
 */

export type InviteView = {
  id: string;
  url: string | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  maxUses: number | null;
  useCount: number;
  createdAt: Date;
  /** False when the ciphertext could not be read, e.g. after a key rotation. */
  linkRecoverable: boolean;
};

export function inviteUrl(token: string): string {
  return `${appUrl()}/invite/${token}`;
}

export function toInviteView(invite: Invite): InviteView {
  const token = decryptSecret(invite.tokenCipher);
  return {
    id: invite.id,
    url: token ? inviteUrl(token) : null,
    expiresAt: invite.expiresAt,
    revokedAt: invite.revokedAt,
    maxUses: invite.maxUses,
    useCount: invite.useCount,
    createdAt: invite.createdAt,
    linkRecoverable: token != null,
  };
}

export async function createInvite(options: {
  eventId: string;
  createdById: string;
  expiresInDays: number | null;
  maxUses: number | null;
}): Promise<InviteView> {
  const token = generateToken();

  const invite = await prisma.invite.create({
    data: {
      eventId: options.eventId,
      createdById: options.createdById,
      tokenHash: hashToken(token),
      tokenCipher: encryptSecret(token),
      expiresAt: options.expiresInDays
        ? new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000)
        : null,
      maxUses: options.maxUses,
    },
  });

  return toInviteView(invite);
}

export type InviteCheck =
  | { ok: true; eventId: string; inviteId: string }
  | { ok: false; reason: 'NOT_FOUND' | 'REVOKED' | 'EXPIRED' | 'EXHAUSTED' | 'CLOSED'; message: string };

/** Validates a token without consuming it. */
export async function checkInvite(token: string): Promise<InviteCheck> {
  const invite = await prisma.invite.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      eventId: true,
      revokedAt: true,
      expiresAt: true,
      maxUses: true,
      useCount: true,
      event: { select: { status: true } },
    },
  });

  if (!invite) {
    return { ok: false, reason: 'NOT_FOUND', message: 'This invite link is not valid.' };
  }
  if (invite.revokedAt) {
    return {
      ok: false,
      reason: 'REVOKED',
      message: 'This invite link has been revoked by the organizer.',
    };
  }
  if (invite.expiresAt && invite.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: 'EXPIRED', message: 'This invite link has expired.' };
  }
  if (invite.maxUses != null && invite.useCount >= invite.maxUses) {
    return {
      ok: false,
      reason: 'EXHAUSTED',
      message: 'This invite link has already been used the maximum number of times.',
    };
  }
  if (invite.event.status !== 'ACTIVE') {
    return {
      ok: false,
      reason: 'CLOSED',
      message: 'This event is no longer accepting new attendees.',
    };
  }

  return { ok: true, eventId: invite.eventId, inviteId: invite.id };
}

export type JoinResult =
  | { ok: true; eventId: string; alreadyMember: boolean }
  | { ok: false; message: string };

/**
 * Redeems an invite.
 *
 * Joining twice is explicitly safe: an existing member is returned as
 * `alreadyMember` without incrementing the use count, so refreshing the invite
 * page or sharing a link with yourself cannot burn a limited-use invite or
 * reset the RSVP you already gave.
 */
export async function redeemInvite(token: string, userId: string): Promise<JoinResult> {
  const check = await checkInvite(token);
  if (!check.ok) return { ok: false, message: check.message };

  const existing = await prisma.eventMember.findUnique({
    where: { eventId_userId: { eventId: check.eventId, userId } },
    select: { id: true },
  });
  if (existing) {
    return { ok: true, eventId: check.eventId, alreadyMember: true };
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Re-check the use count inside the transaction so two people redeeming
      // the last slot at once cannot both get in.
      const invite = await tx.invite.findUnique({
        where: { id: check.inviteId },
        select: { maxUses: true, useCount: true, revokedAt: true },
      });
      if (!invite || invite.revokedAt) {
        throw new Error('INVITE_UNAVAILABLE');
      }
      if (invite.maxUses != null && invite.useCount >= invite.maxUses) {
        throw new Error('INVITE_EXHAUSTED');
      }

      await tx.eventMember.create({
        data: { eventId: check.eventId, userId, role: 'ATTENDEE', rsvp: 'AWAITING' },
      });
      await tx.invite.update({
        where: { id: check.inviteId },
        data: { useCount: { increment: 1 } },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'INVITE_EXHAUSTED') {
      return { ok: false, message: 'This invite link has just reached its usage limit.' };
    }
    // A unique-constraint violation means a concurrent request created the
    // membership first, which is the outcome we wanted anyway.
    const membership = await prisma.eventMember.findUnique({
      where: { eventId_userId: { eventId: check.eventId, userId } },
      select: { id: true },
    });
    if (membership) {
      return { ok: true, eventId: check.eventId, alreadyMember: true };
    }
    return { ok: false, message: 'Could not join this event. Ask the organizer for a new link.' };
  }

  return { ok: true, eventId: check.eventId, alreadyMember: false };
}
