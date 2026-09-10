import { EventNav } from '@/components/event-nav';
import { Alert } from '@/components/ui';
import { requireUser } from '@/lib/authz';
import { getEventForMember } from '@/server/events';

/**
 * Shared chrome for every event screen.
 *
 * Loading the event here is also the authorization gate: `getEventForMember`
 * calls `notFound()` for anyone who is not a member, so no child page can
 * render for a non-member even if it forgot to check.
 */
export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const user = await requireUser(`/events/${eventId}`);
  const { event, membership } = await getEventForMember(eventId, user.id);

  return (
    <div>
      <EventNav eventId={eventId} isOrganizer={membership.isOrganizer} />

      {event.status === 'CANCELLED' ? (
        <div className="mb-6">
          <Alert tone="warning" title="This game night is cancelled">
            The organizer called it off. The details below are kept for reference.
          </Alert>
        </div>
      ) : null}
      {event.status === 'ARCHIVED' ? (
        <div className="mb-6">
          <Alert tone="info" title="This game night is archived">
            It is read-only now.
          </Alert>
        </div>
      ) : null}

      {children}
    </div>
  );
}
