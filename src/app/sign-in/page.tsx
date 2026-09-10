import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { SignInForm } from '@/components/auth-forms';
import { Card, PageHeader } from '@/components/ui';
import { getSessionUser } from '@/lib/authz';

export const metadata: Metadata = { title: 'Sign in' };

function safeNext(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw;
  return '/dashboard';
}

export default async function SignInPage({
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
      <PageHeader title="Welcome back" subtitle="Sign in to see your game nights." />
      <Card>
        <SignInForm next={next} />
      </Card>
    </div>
  );
}
