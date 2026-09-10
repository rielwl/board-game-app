import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { InviteManager } from '@/components/invite-manager';
import { Alert, Card, PageHeader, SectionHeading } from '@/components/ui';
import { requireUser } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { getEventForMember } from '@/server/events';
import { toInviteView } from '@/server/invites';

export const metadata: Metadata = { title: 'Invite people' };
export const dynamic = 'force-dynamic';

export default async function InvitePage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const user = await requireUser(`/events/${eventId}/invite`);
  const { event, membership } = await getEventForMember(eventId, user.id);
  if (!membership.isOrganizer) notFound();

  const invites = await prisma.invite.findMany({
    where: { eventId },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Invite people"
        subtitle={`Share a link to ${event.title}. Anyone with the link can join once they sign in.`}
      />

      <div className="mb-6">
        <Alert tone="info" title="Treat invite links like keys">
          Anyone holding a working link can see this event, including its location. Revoke a link
          if it goes somewhere you did not intend, and create a fresh one.
        </Alert>
      </div>

      <Card>
        <SectionHeading hint="An expiry date and a use limit are both optional.">
          Create a link
        </SectionHeading>
        <InviteManager eventId={eventId} invites={invites.map(toInviteView)} />
      </Card>
    </div>
  );
}
