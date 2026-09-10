import type { Metadata } from 'next';

import { EventForm } from '@/components/event-form';
import { Card, PageHeader } from '@/components/ui';
import { requireUser } from '@/lib/authz';
import { FALLBACK_TIMEZONE, supportedTimezones } from '@/lib/timezones';
import { suggestedStartLocal } from '@/lib/validation';

export const metadata: Metadata = { title: 'New game night' };
export const dynamic = 'force-dynamic';

export default async function NewEventPage() {
  await requireUser('/events/new');

  // Deliberately NOT the host's zone. `Intl` on the server reports wherever the
  // deployment happens to run, which has nothing to do with the organiser; a
  // UTC host used to default every new event to Africa/Abidjan. The form
  // detects the real zone in the browser on mount and corrects both fields.
  // This fallback is what a client without JavaScript keeps, so it has to be a
  // zone that genuinely exists in the option list.
  const timezone = FALLBACK_TIMEZONE;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Plan a game night"
        subtitle="You can change any of this later. Only people you invite will ever see it."
      />
      <Card>
        <EventForm
          mode="create"
          timezones={supportedTimezones(timezone)}
          values={{
            title: '',
            description: '',
            startsAtLocal: suggestedStartLocal(timezone),
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
