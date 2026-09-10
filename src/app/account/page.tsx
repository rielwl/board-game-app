import type { Metadata } from 'next';

import { DisplayNameForm } from '@/components/account-form';
import { Card, PageHeader, SectionHeading } from '@/components/ui';
import { requireUser } from '@/lib/authz';
import { prisma } from '@/lib/prisma';

export const metadata: Metadata = { title: 'Account' };
export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const user = await requireUser('/account');
  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: { email: true, name: true, bggUsername: true, createdAt: true },
  });

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <PageHeader title="Your account" />

      <Card>
        <SectionHeading hint="This is the name your group sees next to your RSVP.">
          Display name
        </SectionHeading>
        <DisplayNameForm defaultName={profile?.name ?? user.name} />
      </Card>

      <Card>
        <SectionHeading>Details</SectionHeading>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="font-semibold">Email</dt>
          <dd>{profile?.email}</dd>
          <dt className="font-semibold">BGG username</dt>
          <dd>{profile?.bggUsername ?? 'Not linked'}</dd>
          <dt className="font-semibold">Member since</dt>
          <dd>{profile?.createdAt.toLocaleDateString('en-GB')}</dd>
        </dl>
      </Card>
    </div>
  );
}
