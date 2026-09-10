import type { Metadata } from 'next';

import { EventForm } from '@/components/event-form';
import { Card, PageHeader } from '@/components/ui';
import { requireUser } from '@/lib/authz';
import { defaultTimezone, supportedTimezones } from '@/lib/timezones';
import { toLocalInputValue } from '@/lib/validation';

export const metadata: Metadata = { title: 'New game night' };
export const dynamic = 'force-dynamic';

export default async function NewEventPage() {
  await requireUser('/events/new');

  const timezone = defaultTimezone();
  // Default to 19:30 a week from now, which is a sane starting point to edit.
  const suggested = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  suggested.setHours(19, 30, 0, 0);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Plan a game night"
        subtitle="You can change any of this later. Only people you invite will ever see it."
      />
      <Card>
        <EventForm
          mode="create"
          timezones={supportedTimezones()}
          values={{
            title: '',
            description: '',
            startsAtLocal: toLocalInputValue(suggested, timezone),
            timezone,
            location: '',
            attendeeNotes: '',
            maxAttendees: '',
          }}
        />
      </Card>
    </div>
  );
}
