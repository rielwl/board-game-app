import 'server-only';

import { notFound } from 'next/navigation';

import { getMembership } from '@/lib/authz';
import { prisma } from '@/lib/prisma';

/**
 * Read models for the event screens.
 *
 * Every function here takes the viewer's user id and refuses to return
 * anything for a non-member. A private event and a non-existent one both come
 * back as `notFound()`, so ids cannot be probed.
 */

export async function getDashboardEvents(userId: string) {
  const memberships = await prisma.eventMember.findMany({
    where: { userId },
    select: {
      role: true,
      rsvp: true,
      event: {
        select: {
          id: true,
          title: true,
          startsAt: true,
          timezone: true,
          location: true,
          status: true,
          _count: { select: { members: true } },
          members: { where: { rsvp: 'YES' }, select: { id: true } },
          selection: { select: { primaryGame: { select: { name: true } } } },
        },
      },
    },
    orderBy: { event: { startsAt: 'asc' } },
  });

  const now = Date.now();
  const rows = memberships.map((membership) => ({
    role: membership.role,
    rsvp: membership.rsvp,
    event: membership.event,
    yesCount: membership.event.members.length,
  }));

  return {
    upcoming: rows.filter(
      (row) => row.event.startsAt.getTime() >= now && row.event.status !== 'ARCHIVED',
    ),
    past: rows
      .filter((row) => row.event.startsAt.getTime() < now || row.event.status === 'ARCHIVED')
      .reverse(),
  };
}

/** Full event detail. Calls `notFound()` when the viewer is not a member. */
export async function getEventForMember(eventId: string, userId: string) {
  const membership = await getMembership(eventId, userId);
  if (!membership) notFound();

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      createdBy: { select: { id: true, name: true } },
      members: {
        include: { user: { select: { id: true, name: true } } },
        orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
      },
      offers: {
        include: {
          user: { select: { id: true, name: true } },
          game: true,
        },
        orderBy: { createdAt: 'asc' },
      },
      requests: {
        include: {
          user: { select: { id: true, name: true } },
          game: { select: { id: true, name: true } },
        },
      },
      preferences: { include: { user: { select: { id: true, name: true } } } },
      selection: {
        include: {
          primaryGame: true,
          backup1Game: true,
          backup2Game: true,
          selectedBy: { select: { name: true } },
        },
      },
    },
  });

  if (!event) notFound();

  return { event, membership };
}

export type EventDetail = Awaited<ReturnType<typeof getEventForMember>>['event'];

/** The viewer's own library, annotated with whether each game is offered. */
export async function getLibraryForEvent(eventId: string, userId: string) {
  const [library, offers] = await Promise.all([
    prisma.userGame.findMany({
      where: { userId },
      include: { game: true },
      orderBy: { game: { name: 'asc' } },
    }),
    prisma.eventGameOffer.findMany({
      where: { eventId, userId },
      select: { gameId: true },
    }),
  ]);

  const offered = new Set(offers.map((offer) => offer.gameId));
  return library.map((row) => ({ ...row, offered: offered.has(row.gameId) }));
}

export async function getUserLibrary(userId: string) {
  return prisma.userGame.findMany({
    where: { userId },
    include: {
      game: {
        include: {
          tags: { include: { tag: true } },
          baseGames: { include: { baseGame: { select: { id: true, name: true } } } },
        },
      },
    },
    orderBy: [{ game: { name: 'asc' } }],
  });
}
