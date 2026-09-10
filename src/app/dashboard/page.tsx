import type { Metadata } from 'next';
import Link from 'next/link';

import { RsvpBadge } from '@/components/rsvp';
import { Badge, ButtonLink, Card, EmptyState, PageHeader } from '@/components/ui';
import { requireUser } from '@/lib/authz';
import { formatInZone } from '@/lib/validation';
import { getDashboardEvents } from '@/server/events';

export const metadata: Metadata = { title: 'Your game nights' };
export const dynamic = 'force-dynamic';

type Row = Awaited<ReturnType<typeof getDashboardEvents>>['upcoming'][number];

function EventRow({ row, past }: { row: Row; past: boolean }) {
  const { event } = row;

  return (
    <Card as="li" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-lg font-bold">
            <Link
              href={`/events/${event.id}`}
              className="underline-offset-4 hover:underline focus-visible:underline"
            >
              {event.title}
            </Link>
          </h3>
          <p className="mt-0.5 text-sm text-[var(--color-ink-soft)]">
            {formatInZone(event.startsAt, event.timezone)} · {event.location}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {row.role === 'ORGANIZER' ? <Badge tone="coral">You organise this</Badge> : null}
          {event.status === 'CANCELLED' ? <Badge tone="amber">Cancelled</Badge> : null}
          {event.status === 'ARCHIVED' ? <Badge>Archived</Badge> : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-[var(--color-ink-soft)]">
          {row.yesCount} of {event._count.members} said yes
        </span>
        <span aria-hidden="true" className="text-[var(--color-line)]">
          |
        </span>
        <span className="flex items-center gap-2">
          <span className="text-[var(--color-ink-soft)]">Your answer:</span>
          <RsvpBadge rsvp={row.rsvp} />
        </span>
      </div>

      {event.selection ? (
        <p className="text-sm">
          <span aria-hidden="true">🏆 </span>
          <span className="font-semibold">{event.selection.primaryGame.name}</span>{' '}
          <span className="text-[var(--color-ink-soft)]">
            {past ? 'was the pick' : 'is locked in'}
          </span>
        </p>
      ) : null}

      {!past && row.rsvp === 'AWAITING' ? (
        <div>
          <ButtonLink href={`/events/${event.id}`} className="px-3 py-1.5">
            Respond now
          </ButtonLink>
        </div>
      ) : null}
    </Card>
  );
}

export default async function DashboardPage() {
  const user = await requireUser('/dashboard');
  const { upcoming, past } = await getDashboardEvents(user.id);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={`Hello, ${user.name}`}
        title="Your game nights"
        actions={<ButtonLink href="/events/new">New game night</ButtonLink>}
      />

      <section aria-labelledby="upcoming-heading">
        <h2 id="upcoming-heading" className="mb-3 text-lg font-bold">
          Coming up
        </h2>
        {upcoming.length === 0 ? (
          <EmptyState
            title="Nothing on the calendar"
            action={<ButtonLink href="/events/new">Plan a game night</ButtonLink>}
          >
            Create a night and share the invite link, or ask a friend to send you theirs.
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {upcoming.map((row) => (
              <EventRow key={row.event.id} row={row} past={false} />
            ))}
          </ul>
        )}
      </section>

      {past.length > 0 ? (
        <section aria-labelledby="past-heading">
          <h2 id="past-heading" className="mb-3 text-lg font-bold">
            Past nights
          </h2>
          <ul className="flex flex-col gap-3">
            {past.map((row) => (
              <EventRow key={row.event.id} row={row} past />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
