import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { SignUpForm } from '@/components/auth-forms';
import { Card, PageHeader } from '@/components/ui';
import { getSessionUser } from '@/lib/authz';

export const metadata: Metadata = { title: 'Create an account' };

function safeNext(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw;
  return '/dashboard';
}

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeNext(params.next);

  const user = await getSessionUser();
  if (user) redirect(next);

  return (
    <div className="mx-auto max-w-md">
      <PageHeader
        title="Create your account"
        subtitle="You will need one to organise a night or to join someone else's."
      />
      <Card>
        <SignUpForm next={next} />
      </Card>
    </div>
  );
}
