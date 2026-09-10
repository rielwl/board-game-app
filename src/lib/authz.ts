import 'server-only';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { EventRole } from '@prisma/client';

import { auth } from './auth';
import { prisma } from './prisma';

export type SessionUser = {
  id: string;
  email: string;
  name: string;
};

/**
 * The authorization rules, in one place:
 *
 *  - Only a signed-in user has any access at all.
 *  - Only an EventMember may read an event, including its location.
 *  - Only the ORGANIZER may edit the event, manage invites, change
 *    recommendation settings, or lock a selection.
 *
 * Every server action and route handler funnels through these helpers. The UI
 * hides what you cannot do; these functions are what actually enforces it.
 */

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  };
}

export async function requireUser(redirectTo?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    const target = redirectTo ? `/sign-in?next=${encodeURIComponent(redirectTo)}` : '/sign-in';
    redirect(target);
  }
  return user;
}

/** Thrown by the `assert*` helpers; server actions turn it into a form error. */
export class AuthorizationError extends Error {
  readonly status: number;

  constructor(message = 'You do not have access to this event.', status = 403) {
    super(message);
    this.name = 'AuthorizationError';
    this.status = status;
  }
}

export type EventMembership = {
  eventId: string;
  userId: string;
  role: EventRole;
  isOrganizer: boolean;
};

/**
 * Returns the caller's membership, or null when they are not a member.
 *
 * Note that a non-member and a non-existent event are deliberately
 * indistinguishable to the caller: both produce null, and callers surface a
 * 404, so private events are not enumerable.
 */
export async function getMembership(
  eventId: string,
  userId: string,
): Promise<EventMembership | null> {
  const member = await prisma.eventMember.findUnique({
    where: { eventId_userId: { eventId, userId } },
    select: { eventId: true, userId: true, role: true },
  });
  if (!member) return null;
  return { ...member, isOrganizer: member.role === 'ORGANIZER' };
}

export async function assertMember(eventId: string, userId: string): Promise<EventMembership> {
  const membership = await getMembership(eventId, userId);
  if (!membership) {
    throw new AuthorizationError('Event not found, or you are not a member of it.', 404);
  }
  return membership;
}

export async function assertOrganizer(eventId: string, userId: string): Promise<EventMembership> {
  const membership = await assertMember(eventId, userId);
  if (!membership.isOrganizer) {
    throw new AuthorizationError('Only the organizer can do that.', 403);
  }
  return membership;
}
