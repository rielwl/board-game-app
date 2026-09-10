'use server';

import { revalidatePath } from 'next/cache';

import { assertOrganizer, requireUser } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { clientIpFrom, consumeRateLimit } from '@/lib/rate-limit';
import { inviteInputSchema } from '@/lib/validation';
import { createInvite, redeemInvite } from '@/server/invites';
import { headers } from 'next/headers';

import {
  failure,
  fieldErrorsFrom,
  firstMessage,
  runAction,
  success,
  type ActionState,
} from './shared';

export async function createInviteAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const eventId = String(formData.get('eventId') ?? '');
    await assertOrganizer(eventId, user.id);

    const parsed = inviteInputSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      const fieldErrors = fieldErrorsFrom(parsed.error);
      return failure(firstMessage(fieldErrors), fieldErrors);
    }

    await createInvite({
      eventId,
      createdById: user.id,
      expiresInDays: parsed.data.expiresInDays,
      maxUses: parsed.data.maxUses,
    });

    revalidatePath(`/events/${eventId}/invite`);
    return success('New invite link created.');
  });
}

export async function revokeInviteAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const eventId = String(formData.get('eventId') ?? '');
    const inviteId = String(formData.get('inviteId') ?? '');
    await assertOrganizer(eventId, user.id);

    // Scoping the update by eventId as well as id means an organizer of one
    // event cannot revoke another event's invite by guessing its id.
    const result = await prisma.invite.updateMany({
      where: { id: inviteId, eventId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) return failure('That invite link is already revoked.');

    revalidatePath(`/events/${eventId}/invite`);
    return success('Invite link revoked.');
  });
}

export async function joinEventAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const token = String(formData.get('token') ?? '');
    const user = await requireUser(`/invite/${token}`);

    // Redemption is rate limited per user so a valid session cannot be used to
    // brute-force invite tokens.
    const ip = clientIpFrom(await headers());
    const limit = await consumeRateLimit({
      bucket: 'invite-redeem',
      key: `${user.id}:${ip}`,
      limit: 20,
      windowSeconds: 300,
    });
    if (!limit.allowed) {
      return failure('Too many invite attempts. Please wait a few minutes and try again.');
    }

    const result = await redeemInvite(token, user.id);
    if (!result.ok) return failure(result.message);

    revalidatePath('/dashboard');
    revalidatePath(`/events/${result.eventId}`);
    return success(
      result.alreadyMember
        ? 'You are already a member of this event.'
        : 'Welcome — you have joined the event.',
    );
  });
}
