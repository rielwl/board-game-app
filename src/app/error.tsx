'use client';

import { useEffect } from 'react';

import { Alert, Card, PageHeader, buttonStyles } from '@/components/ui';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Something went wrong" />
      <Card className="flex flex-col gap-4">
        <Alert tone="error">
          We could not load this page. That is on us, not on you.
        </Alert>
        {error.digest ? (
          <p className="text-xs text-[var(--color-ink-soft)]">
            Reference: <code>{error.digest}</code>
          </p>
        ) : null}
        <div>
          <button type="button" onClick={reset} className={buttonStyles.primary}>
            Try again
          </button>
        </div>
      </Card>
    </div>
  );
}
