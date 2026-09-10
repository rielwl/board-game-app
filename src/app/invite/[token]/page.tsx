import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { JoinEventForm } from '@/components/join-event-form';
import { Alert, ButtonLink, Card, PageHeader } from '@/components/ui';
import { getSessionUser } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { formatInZone } from '@/lib/validation';
import { checkInvite } from '@/server/invites';

export const metadata: Metadata = { title: 'Event invitation' };
export const dynamic = 'force-dynamic';

export default async function InviteLandingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const check = await checkInvite(token);

  if (!check.ok) {
    return (
      <div className="mx-auto max-w-md">
        <PageHeader title="This invite will not work" />
        <Card className="flex flex-col gap-4">
          <Alert tone="error">{check.message}</Alert>
          <p className="text-sm text-[var(--color-ink-soft)]">
            Ask the organizer to send you a fresh link.
          </p>
          <div>
            <ButtonLink href="/dashboard" variant="secondary">
              Go to your events
            </ButtonLink>
          </div>
        </Card>
      </div>
    );
  }

  const user = await getSessionUser();

  // Only the bare minimum is shown before joining: enough to recognise the
  // event, but not the location or the guest list.
  const event = await prisma.event.findUnique({
    where: { id: check.eventId },
    select: {
      id: true,
      title: true,
      startsAt: true,
      timezone: true,
      createdBy: { select: { name: true } },
    },
  });
  if (!event) {
    return (
      <div className="mx-auto max-w-md">
        <PageHeader title="This invite will not work" />
        <Card>
          <Alert tone="error">That event no longer exists.</Alert>
        </Card>
      </div>
    );
  }

  // Already a member? Skip the ceremony and go straight in.
  if (user) {
    const membership = await prisma.eventMember.findUnique({
      where: { eventId_userId: { eventId: event.id, userId: user.id } },
      select: { id: true },
    });
    if (membership) redirect(`/events/${event.id}`);
  }

  return (
    <div className="mx-auto max-w-md">
      <PageHeader
        eyebrow="You have been invited"
        title={event.title}
        subtitle={`${event.createdBy.name} is organising this on ${formatInZone(
          event.startsAt,
          event.timezone,
        )}.`}
      />

      <Card className="flex flex-col gap-4">
        {user ? (
          <>
            <p className="text-sm">
              Signed in as <span className="font-semibold">{user.name}</span>. Join to see the
              location, RSVP and say what you can bring.
            </p>
            <JoinEventForm token={token} />
          </>
        ) : (
          <>
            <p className="text-sm">
              You need an account to join. It takes a moment, and it is what keeps this event
              private.
            </p>
            <div className="flex flex-wrap gap-2">
              <ButtonLink href={`/sign-up?next=${encodeURIComponent(`/invite/${token}`)}`}>
                Create an account
              </ButtonLink>
              <ButtonLink
                href={`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`}
                variant="secondary"
              >
                Sign in
              </ButtonLink>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
