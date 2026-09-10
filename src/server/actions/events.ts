'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { assertMember, assertOrganizer, requireUser } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import {
  eventInputSchema,
  localDateTimeToUtc,
  recommendationSettingsSchema,
  rsvpSchema,
} from '@/lib/validation';

import {
  failure,
  fieldErrorsFrom,
  firstMessage,
  runAction,
  success,
  type ActionState,
} from './shared';

export async function createEventAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let newEventId: string | null = null;

  const state = await runAction(async () => {
    const user = await requireUser('/events/new');

    const parsed = eventInputSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      const fieldErrors = fieldErrorsFrom(parsed.error);
      return failure(firstMessage(fieldErrors), fieldErrors);
    }

    const input = parsed.data;
    const event = await prisma.event.create({
      data: {
        title: input.title,
        description: input.description,
        startsAt: localDateTimeToUtc(input.startsAtLocal, input.timezone),
        timezone: input.timezone,
        location: input.location,
        attendeeNotes: input.attendeeNotes,
        maxAttendees: input.maxAttendees,
        createdById: user.id,
        // The creator is a member from the start, as organizer and a Yes.
        members: {
          create: {
            userId: user.id,
            role: 'ORGANIZER',
            rsvp: 'YES',
            respondedAt: new Date(),
          },
        },
      },
      select: { id: true },
    });

    newEventId = event.id;
    return success();
  });

  if (newEventId) {
    revalidatePath('/dashboard');
    redirect(`/events/${newEventId}`);
  }
  return state;
}

export async function updateEventAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const eventId = String(formData.get('eventId') ?? '');
    await assertOrganizer(eventId, user.id);

    const parsed = eventInputSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      const fieldErrors = fieldErrorsFrom(parsed.error);
      return failure(firstMessage(fieldErrors), fieldErrors);
    }

    const input = parsed.data;
    await prisma.event.update({
      where: { id: eventId },
      data: {
        title: input.title,
        description: input.description,
        startsAt: localDateTimeToUtc(input.startsAtLocal, input.timezone),
        timezone: input.timezone,
        location: input.location,
        attendeeNotes: input.attendeeNotes,
        maxAttendees: input.maxAttendees,
      },
    });

    revalidatePath(`/events/${eventId}`);
    revalidatePath('/dashboard');
    return success('Event updated.');
  });
}

export async function updateRecommendationSettingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const eventId = String(formData.get('eventId') ?? '');
    await assertOrganizer(eventId, user.id);

    const parsed = recommendationSettingsSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      const fieldErrors = fieldErrorsFrom(parsed.error);
      return failure(firstMessage(fieldErrors), fieldErrors);
    }

    await prisma.event.update({ where: { id: eventId }, data: parsed.data });
    revalidatePath(`/events/${eventId}/recommendations`);
    return success('Recommendation settings updated.');
  });
}

export async function setEventStatusAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const eventId = String(formData.get('eventId') ?? '');
    const status = String(formData.get('status') ?? '');
    if (status !== 'ACTIVE' && status !== 'CANCELLED' && status !== 'ARCHIVED') {
      return failure('Unknown event status.');
    }

    await assertOrganizer(eventId, user.id);
    await prisma.event.update({ where: { id: eventId }, data: { status } });

    revalidatePath(`/events/${eventId}`);
    revalidatePath('/dashboard');
    return success(
      status === 'CANCELLED'
        ? 'Event cancelled. Members can still see it, marked as cancelled.'
        : status === 'ARCHIVED'
          ? 'Event archived.'
          : 'Event reopened.',
    );
  });
}

export async function setRsvpAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();

    const parsed = rsvpSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      const fieldErrors = fieldErrorsFrom(parsed.error);
      return failure(firstMessage(fieldErrors), fieldErrors);
    }

    const { eventId, rsvp, rsvpNote } = parsed.data;
    await assertMember(eventId, user.id);

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { status: true, maxAttendees: true },
    });
    if (!event) return failure('That event no longer exists.');
    if (event.status !== 'ACTIVE') {
      return failure('This event is closed, so RSVPs can no longer change.');
    }

    // Capacity is only checked when moving *to* Yes, and the caller's own
    // existing Yes does not count against it.
    if (rsvp === 'YES' && event.maxAttendees != null) {
      const yesCount = await prisma.eventMember.count({
        where: { eventId, rsvp: 'YES', NOT: { userId: user.id } },
      });
      if (yesCount >= event.maxAttendees) {
        return failure(
          `This night is full (${event.maxAttendees} attending). You can still answer Maybe.`,
        );
      }
    }

    await prisma.eventMember.update({
      where: { eventId_userId: { eventId, userId: user.id } },
      data: { rsvp, rsvpNote, respondedAt: new Date() },
    });

    revalidatePath(`/events/${eventId}`);
    revalidatePath(`/events/${eventId}/recommendations`);
    revalidatePath('/dashboard');
    return success('RSVP saved.');
  });
}
