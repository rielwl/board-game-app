import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createPrismaMock } from './helpers/prisma-mock';

/**
 * Event server actions: creating, editing, status changes and RSVPs.
 *
 * The authorization helpers are mocked so each test can say plainly whether
 * the caller is the organizer, a member, or neither — what is being checked
 * is that the action asks the right question before it writes, and that a
 * refusal never reaches the database.
 */

const prisma = createPrismaMock();
const requireUser = vi.fn();
const assertMember = vi.fn();
const assertOrganizer = vi.fn();
const revalidatePath = vi.fn();
const redirect = vi.fn((to: string) => {
  const error = new Error(`NEXT_REDIRECT;replace;${to};307;`) as Error & { digest: string };
  error.digest = `NEXT_REDIRECT;replace;${to};307;`;
  throw error;
});

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/auth', () => ({ auth: {} }));
vi.mock('@/lib/authz', async () => {
  const actual = await vi.importActual<typeof import('@/lib/authz')>('@/lib/authz');
  return {
    ...actual,
    requireUser: (to?: string) => requireUser(to),
    assertMember: (eventId: string, userId: string) => assertMember(eventId, userId),
    assertOrganizer: (eventId: string, userId: string) => assertOrganizer(eventId, userId),
  };
});
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => revalidatePath(path) }));
vi.mock('next/navigation', () => ({ redirect: (to: string) => redirect(to) }));

const { AuthorizationError } = await import('@/lib/authz');
const {
  createEventAction,
  setEventStatusAction,
  setRsvpAction,
  updateEventAction,
  updateRecommendationSettingsAction,
} = await import('@/server/actions/events');
const { idleState } = await import('@/server/actions/state');

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

const validEvent = {
  title: 'Thursday games',
  startsAtLocal: '2026-09-17T19:30',
  timezone: 'Europe/London',
  location: 'The back room',
};

beforeEach(() => {
  prisma.reset();
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: 'u1', email: 'ada@example.com', name: 'Ada' });
  assertMember.mockResolvedValue({ eventId: 'e1', userId: 'u1', role: 'ATTENDEE', isOrganizer: false });
  assertOrganizer.mockResolvedValue({ eventId: 'e1', userId: 'u1', role: 'ORGANIZER', isOrganizer: true });
});

describe('createEventAction', () => {
  it('makes the creator an organizer who has already said yes', async () => {
    prisma.event.create.mockResolvedValue({ id: 'e1' });

    await expect(createEventAction(idleState, form(validEvent))).rejects.toThrow('NEXT_REDIRECT');

    const call = prisma.event.create.mock.calls[0]?.[0] as {
      data: { createdById: string; members: { create: { role: string; rsvp: string } } };
    };
    expect(call.data.createdById).toBe('u1');
    expect(call.data.members.create).toMatchObject({ userId: 'u1', role: 'ORGANIZER', rsvp: 'YES' });
  });

  it('redirects to the new event once it exists', async () => {
    prisma.event.create.mockResolvedValue({ id: 'e1' });

    await expect(createEventAction(idleState, form(validEvent))).rejects.toThrow('NEXT_REDIRECT');

    expect(redirect).toHaveBeenCalledWith('/events/e1');
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard');
  });

  it('converts the local start time using the event timezone', async () => {
    prisma.event.create.mockResolvedValue({ id: 'e1' });

    await expect(
      createEventAction(idleState, form({ ...validEvent, timezone: 'Europe/London' })),
    ).rejects.toThrow('NEXT_REDIRECT');

    const call = prisma.event.create.mock.calls[0]?.[0] as { data: { startsAt: Date } };
    // 19:30 London in September is BST (UTC+1).
    expect(call.data.startsAt.toISOString()).toBe('2026-09-17T18:30:00.000Z');
  });

  it('returns field errors and does not redirect when the form is invalid', async () => {
    const state = await createEventAction(idleState, form({ ...validEvent, title: 'no' }));

    expect(state.status).toBe('error');
    expect(state.fieldErrors.title).toBeDefined();
    expect(prisma.event.create).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('rejects a timezone Intl does not recognise', async () => {
    const state = await createEventAction(
      idleState,
      form({ ...validEvent, timezone: 'Mars/Olympus_Mons' }),
    );

    expect(state.status).toBe('error');
    expect(prisma.event.create).not.toHaveBeenCalled();
  });

  it('stores an omitted attendee cap as null rather than zero', async () => {
    prisma.event.create.mockResolvedValue({ id: 'e1' });

    await expect(
      createEventAction(idleState, form({ ...validEvent, maxAttendees: '' })),
    ).rejects.toThrow('NEXT_REDIRECT');

    const call = prisma.event.create.mock.calls[0]?.[0] as { data: { maxAttendees: number | null } };
    expect(call.data.maxAttendees).toBeNull();
  });
});

describe('updateEventAction', () => {
  it('requires the organizer before writing anything', async () => {
    assertOrganizer.mockRejectedValue(new AuthorizationError('Only the organizer can do that.'));

    const state = await updateEventAction(idleState, form({ ...validEvent, eventId: 'e1' }));

    expect(state).toMatchObject({ status: 'error', message: 'Only the organizer can do that.' });
    expect(prisma.event.update).not.toHaveBeenCalled();
  });

  it('updates the event the organizer named', async () => {
    prisma.event.update.mockResolvedValue({ id: 'e1' });

    const state = await updateEventAction(idleState, form({ ...validEvent, eventId: 'e1' }));

    expect(assertOrganizer).toHaveBeenCalledWith('e1', 'u1');
    expect(prisma.event.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'e1' } }),
    );
    expect(state).toMatchObject({ status: 'success', message: 'Event updated.' });
  });

  it('validates after authorizing, so a bad form still cannot probe another event', async () => {
    assertOrganizer.mockRejectedValue(new AuthorizationError('Event not found, or you are not a member of it.', 404));

    const state = await updateEventAction(idleState, form({ eventId: 'someone-elses' }));

    expect(state.message).toBe('Event not found, or you are not a member of it.');
  });
});

describe('updateRecommendationSettingsAction', () => {
  it('saves the parsed settings for the organizer', async () => {
    prisma.event.update.mockResolvedValue({ id: 'e1' });

    const state = await updateRecommendationSettingsAction(
      idleState,
      form({ eventId: 'e1', targetPlayerCount: '5', maxDurationMinutes: '120', complexityTarget: '2.5' }),
    );

    expect(prisma.event.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: { targetPlayerCount: 5, maxDurationMinutes: 120, complexityTarget: 2.5 },
    });
    expect(state.status).toBe('success');
  });

  it('clears a setting that was submitted empty', async () => {
    prisma.event.update.mockResolvedValue({ id: 'e1' });

    await updateRecommendationSettingsAction(
      idleState,
      form({ eventId: 'e1', targetPlayerCount: '', maxDurationMinutes: '', complexityTarget: '' }),
    );

    expect(prisma.event.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: { targetPlayerCount: null, maxDurationMinutes: null, complexityTarget: null },
    });
  });

  it('rejects an out-of-range complexity target', async () => {
    const state = await updateRecommendationSettingsAction(
      idleState,
      form({ eventId: 'e1', complexityTarget: '9' }),
    );

    expect(state.status).toBe('error');
    expect(prisma.event.update).not.toHaveBeenCalled();
  });

  it('refuses a non-organizer', async () => {
    assertOrganizer.mockRejectedValue(new AuthorizationError('Only the organizer can do that.'));

    const state = await updateRecommendationSettingsAction(idleState, form({ eventId: 'e1' }));

    expect(state.status).toBe('error');
    expect(prisma.event.update).not.toHaveBeenCalled();
  });
});

describe('setEventStatusAction', () => {
  it.each([
    ['CANCELLED', 'Event cancelled. Members can still see it, marked as cancelled.'],
    ['ARCHIVED', 'Event archived.'],
    ['ACTIVE', 'Event reopened.'],
  ])('sets %s and explains what happened', async (status, message) => {
    prisma.event.update.mockResolvedValue({ id: 'e1' });

    const state = await setEventStatusAction(idleState, form({ eventId: 'e1', status }));

    expect(prisma.event.update).toHaveBeenCalledWith({ where: { id: 'e1' }, data: { status } });
    expect(state).toMatchObject({ status: 'success', message });
  });

  it('rejects a status outside the known set before authorizing', async () => {
    const state = await setEventStatusAction(idleState, form({ eventId: 'e1', status: 'DELETED' }));

    expect(state).toMatchObject({ status: 'error', message: 'Unknown event status.' });
    expect(assertOrganizer).not.toHaveBeenCalled();
    expect(prisma.event.update).not.toHaveBeenCalled();
  });

  it('refuses a non-organizer', async () => {
    assertOrganizer.mockRejectedValue(new AuthorizationError('Only the organizer can do that.'));

    const state = await setEventStatusAction(idleState, form({ eventId: 'e1', status: 'ARCHIVED' }));

    expect(state.status).toBe('error');
    expect(prisma.event.update).not.toHaveBeenCalled();
  });
});

describe('setRsvpAction', () => {
  const activeEvent = { status: 'ACTIVE', maxAttendees: null };

  it('saves an RSVP for a member and stamps the response time', async () => {
    prisma.event.findUnique.mockResolvedValue(activeEvent);
    prisma.eventMember.update.mockResolvedValue({ id: 'm1' });

    const state = await setRsvpAction(idleState, form({ eventId: 'e1', rsvp: 'YES' }));

    expect(assertMember).toHaveBeenCalledWith('e1', 'u1');
    const call = prisma.eventMember.update.mock.calls[0]?.[0] as {
      where: unknown;
      data: { rsvp: string; respondedAt: Date };
    };
    expect(call.where).toEqual({ eventId_userId: { eventId: 'e1', userId: 'u1' } });
    expect(call.data.rsvp).toBe('YES');
    expect(call.data.respondedAt).toBeInstanceOf(Date);
    expect(state).toMatchObject({ status: 'success', message: 'RSVP saved.' });
  });

  it('refuses a non-member', async () => {
    assertMember.mockRejectedValue(
      new AuthorizationError('Event not found, or you are not a member of it.', 404),
    );

    const state = await setRsvpAction(idleState, form({ eventId: 'e1', rsvp: 'YES' }));

    expect(state.status).toBe('error');
    expect(prisma.eventMember.update).not.toHaveBeenCalled();
  });

  it('rejects an RSVP value outside the known set', async () => {
    const state = await setRsvpAction(idleState, form({ eventId: 'e1', rsvp: 'PROBABLY' }));

    expect(state.status).toBe('error');
    expect(assertMember).not.toHaveBeenCalled();
  });

  it('reports an event that has since been deleted', async () => {
    prisma.event.findUnique.mockResolvedValue(null);

    const state = await setRsvpAction(idleState, form({ eventId: 'e1', rsvp: 'YES' }));

    expect(state).toMatchObject({ status: 'error', message: 'That event no longer exists.' });
  });

  it.each([['CANCELLED'], ['ARCHIVED']])('refuses to change an RSVP on a %s event', async (status) => {
    prisma.event.findUnique.mockResolvedValue({ status, maxAttendees: null });

    const state = await setRsvpAction(idleState, form({ eventId: 'e1', rsvp: 'NO' }));

    expect(state).toMatchObject({
      status: 'error',
      message: 'This event is closed, so RSVPs can no longer change.',
    });
    expect(prisma.eventMember.update).not.toHaveBeenCalled();
  });

  it('turns away a Yes once the night is full', async () => {
    prisma.event.findUnique.mockResolvedValue({ status: 'ACTIVE', maxAttendees: 6 });
    prisma.eventMember.count.mockResolvedValue(6);

    const state = await setRsvpAction(idleState, form({ eventId: 'e1', rsvp: 'YES' }));

    expect(state).toMatchObject({
      status: 'error',
      message: 'This night is full (6 attending). You can still answer Maybe.',
    });
    expect(prisma.eventMember.update).not.toHaveBeenCalled();
  });

  it('excludes the caller from the capacity count, so re-confirming Yes still works', async () => {
    prisma.event.findUnique.mockResolvedValue({ status: 'ACTIVE', maxAttendees: 6 });
    prisma.eventMember.count.mockResolvedValue(5);
    prisma.eventMember.update.mockResolvedValue({ id: 'm1' });

    const state = await setRsvpAction(idleState, form({ eventId: 'e1', rsvp: 'YES' }));

    expect(prisma.eventMember.count).toHaveBeenCalledWith({
      where: { eventId: 'e1', rsvp: 'YES', NOT: { userId: 'u1' } },
    });
    expect(state.status).toBe('success');
  });

  it.each([['MAYBE'], ['NO']])('does not check capacity when answering %s', async (rsvp) => {
    prisma.event.findUnique.mockResolvedValue({ status: 'ACTIVE', maxAttendees: 1 });
    prisma.eventMember.update.mockResolvedValue({ id: 'm1' });

    const state = await setRsvpAction(idleState, form({ eventId: 'e1', rsvp }));

    expect(prisma.eventMember.count).not.toHaveBeenCalled();
    expect(state.status).toBe('success');
  });

  it('stores an empty RSVP note as null', async () => {
    prisma.event.findUnique.mockResolvedValue(activeEvent);
    prisma.eventMember.update.mockResolvedValue({ id: 'm1' });

    await setRsvpAction(idleState, form({ eventId: 'e1', rsvp: 'MAYBE', rsvpNote: '   ' }));

    const call = prisma.eventMember.update.mock.calls[0]?.[0] as { data: { rsvpNote: null } };
    expect(call.data.rsvpNote).toBeNull();
  });
});
