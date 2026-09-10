import type { Metadata } from 'next';

import { EventForm } from '@/components/event-form';
import { Card, PageHeader } from '@/components/ui';
import { requireUser } from '@/lib/authz';
import { defaultTimezone, supportedTimezones } from '@/lib/timezones';
import { toLocalInputValue } from '@/lib/validation';

export const metadata: Metadata = { title: 'New game night' };
export const dynamic = 'force-dynamic';

/**
 * A sensible starting point for the date field: 19:30, a week from now.
 *
 * Kept out of the component body deliberately. Reading the clock during render
 * is impure, and React's lint rules rightly flag it; doing it here, before the
 * component renders, keeps the render itself a pure function of its arguments.
 */
function suggestedStart(timeZone: string): string {
  const suggested = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  suggested.setHours(19, 30, 0, 0);
  return toLocalInputValue(suggested, timeZone);
}

export default async function NewEventPage() {
  await requireUser('/events/new');

  const timezone = defaultTimezone();
  const startsAtLocal = suggestedStart(timezone);

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
            startsAtLocal,
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
