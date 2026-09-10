import type { Metadata } from 'next';
import Link from 'next/link';

import { EventStatusControls } from '@/components/event-status-controls';
import { RSVP_GROUPS, RsvpBadge } from '@/components/rsvp';
import { RsvpForm } from '@/components/rsvp-form';
import { Badge, ButtonLink, Card, EmptyState, PageHeader, SectionHeading } from '@/components/ui';
import { requireUser } from '@/lib/authz';
import { formatInZone } from '@/lib/validation';
import { getEventForMember } from '@/server/events';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ eventId: string }>;
}): Promise<Metadata> {
  const { eventId } = await params;
  const user = await requireUser(`/events/${eventId}`);
  const { event } = await getEventForMember(eventId, user.id);
  return { title: event.title };
}

export default async function EventOverviewPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const user = await requireUser(`/events/${eventId}`);
  const { event, membership } = await getEventForMember(eventId, user.id);

  const me = event.members.find((member) => member.userId === user.id);
  const closed = event.status !== 'ACTIVE';

  const grouped = RSVP_GROUPS.map((group) => ({
    ...group,
    members: event.members.filter((member) => member.rsvp === group.status),
  }));

  const yesCount = grouped.find((group) => group.status === 'YES')?.members.length ?? 0;

  // One row per offered game, with everybody who offered it.
  const offersByGame = new Map<
    string,
    { name: string; isExpansion: boolean; owners: { name: string; rsvp: string }[] }
  >();
  for (const offer of event.offers) {
    const entry = offersByGame.get(offer.gameId) ?? {
      name: offer.game.name,
      isExpansion: offer.game.isExpansion,
      owners: [],
    };
    const member = event.members.find((m) => m.userId === offer.userId);
    entry.owners.push({ name: offer.user.name, rsvp: member?.rsvp ?? 'AWAITING' });
    offersByGame.set(offer.gameId, entry);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={membership.isOrganizer ? 'You organise this night' : 'You are invited'}
        title={event.title}
        subtitle={
          <span className="flex flex-col gap-0.5">
            <span>
              <span aria-hidden="true">🗓 </span>
              {formatInZone(event.startsAt, event.timezone)}{' '}
              <span className="text-xs">({event.timezone})</span>
            </span>
            <span>
              <span aria-hidden="true">📍 </span>
              {event.location}
            </span>
          </span>
        }
        actions={
          membership.isOrganizer ? (
            <>
              <ButtonLink href={`/events/${eventId}/edit`} variant="secondary">
                Edit details
              </ButtonLink>
              <ButtonLink href={`/events/${eventId}/invite`}>Invite people</ButtonLink>
            </>
          ) : null
        }
      />

      {event.description ? (
        <Card>
          <SectionHeading>About this night</SectionHeading>
          <p className="whitespace-pre-line text-sm">{event.description}</p>
        </Card>
      ) : null}

      {event.attendeeNotes ? (
        <Card>
          <SectionHeading>Notes for attendees</SectionHeading>
          <p className="whitespace-pre-line text-sm">{event.attendeeNotes}</p>
        </Card>
      ) : null}

      <Card>
        <SectionHeading
          hint={
            closed
              ? 'This event is closed, so RSVPs are locked.'
              : event.maxAttendees
                ? `${yesCount} of a maximum ${event.maxAttendees} places taken.`
                : undefined
          }
        >
          Your RSVP
        </SectionHeading>
        <RsvpForm
          eventId={eventId}
          current={me?.rsvp ?? 'AWAITING'}
          currentNote={me?.rsvpNote ?? null}
          disabled={closed}
        />
      </Card>

      <Card>
        <SectionHeading hint={`${event.members.length} people invited.`}>Who is coming</SectionHeading>
        <div className="grid gap-4 sm:grid-cols-2">
          {grouped.map((group) => (
            <div key={group.status}>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
                <RsvpBadge rsvp={group.status} />
                <span className="text-[var(--color-ink-soft)]">{group.members.length}</span>
              </h3>
              {group.members.length === 0 ? (
                <p className="text-sm text-[var(--color-ink-soft)]">Nobody yet.</p>
              ) : (
                <ul className="flex flex-col gap-1 text-sm">
                  {group.members.map((member) => (
                    <li key={member.id} className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-semibold">{member.user.name}</span>
                      {member.role === 'ORGANIZER' ? (
                        <Badge tone="coral">Organizer</Badge>
                      ) : null}
                      {member.rsvpNote ? (
                        <span className="text-[var(--color-ink-soft)]">
                          &ldquo;{member.rsvpNote}&rdquo;
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionHeading
          hint="Only games somebody explicitly offered to bring. Owning a game is not the same as bringing it."
        >
          Games on offer
        </SectionHeading>
        {offersByGame.size === 0 ? (
          <EmptyState
            title="No games offered yet"
            action={<ButtonLink href={`/events/${eventId}/offers`}>Offer a game</ButtonLink>}
          >
            Add games to your library, then say which ones you can bring to this night.
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-2">
            {[...offersByGame.entries()].map(([gameId, entry]) => (
              <li
                key={gameId}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-[var(--color-paper-sunken)]/60 px-3 py-2 text-sm"
              >
                <span className="font-semibold">
                  {entry.name}
                  {entry.isExpansion ? (
                    <Badge tone="amber" className="ml-2">
                      Expansion
                    </Badge>
                  ) : null}
                </span>
                <span className="text-[var(--color-ink-soft)]">
                  brought by {entry.owners.map((owner) => owner.name).join(', ')}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-sm">
          <Link
            href={`/events/${eventId}/offers`}
            className="font-semibold underline underline-offset-2"
          >
            Manage what you are bringing →
          </Link>
        </p>
      </Card>

      {membership.isOrganizer ? (
        <Card>
          <SectionHeading hint="Cancelling keeps the event visible to members. Archiving moves it out of the way.">
            Organizer controls
          </SectionHeading>
          <EventStatusControls eventId={eventId} status={event.status} />
        </Card>
      ) : null}
    </div>
  );
}
