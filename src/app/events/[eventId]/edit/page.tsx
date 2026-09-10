import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { EventForm } from '@/components/event-form';
import { Card, PageHeader } from '@/components/ui';
import { requireUser } from '@/lib/authz';
import { supportedTimezones } from '@/lib/timezones';
import { toLocalInputValue } from '@/lib/validation';
import { getEventForMember } from '@/server/events';

export const metadata: Metadata = { title: 'Edit game night' };
export const dynamic = 'force-dynamic';

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const user = await requireUser(`/events/${eventId}/edit`);
  const { event, membership } = await getEventForMember(eventId, user.id);

  // Attendees get a 404 rather than a 403: the edit page is simply not there
  // for them, which leaks nothing about the event's structure.
  if (!membership.isOrganizer) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Edit game night" subtitle={event.title} />
      <Card>
        <EventForm
          mode="edit"
          // The stored zone may not be in the canonical list — `UTC` never is —
          // so fold it in, or editing would silently rewrite it to the first
          // option in the list.
          timezones={supportedTimezones(event.timezone)}
          values={{
            eventId: event.id,
            title: event.title,
            description: event.description ?? '',
            startsAtLocal: toLocalInputValue(event.startsAt, event.timezone),
            timezone: event.timezone,
            location: event.location,
            attendeeNotes: event.attendeeNotes ?? '',
            maxAttendees: event.maxAttendees != null ? String(event.maxAttendees) : '',
          }}
        />
      </Card>
    </div>
  );
}
