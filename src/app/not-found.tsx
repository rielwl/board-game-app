import { ButtonLink, Card, PageHeader } from '@/components/ui';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md text-center">
      <PageHeader title="Nothing here" />
      <Card className="flex flex-col gap-4">
        <p className="text-sm text-[var(--color-ink-soft)]">
          This page does not exist, or it belongs to an event you are not a member of. Private
          events look exactly like missing ones, on purpose.
        </p>
        <div className="flex justify-center">
          <ButtonLink href="/dashboard">Back to your events</ButtonLink>
        </div>
      </Card>
    </div>
  );
}
