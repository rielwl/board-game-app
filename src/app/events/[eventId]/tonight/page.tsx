import type { Metadata } from 'next';

import { BggAttribution } from '@/components/bgg-attribution';
import { RSVP_GROUPS, RsvpBadge } from '@/components/rsvp';
import { Badge, ButtonLink, Card, EmptyState, PageHeader, SectionHeading } from '@/components/ui';
import { requireUser } from '@/lib/authz';
import { formatInZone } from '@/lib/validation';
import { getEventForMember } from '@/server/events';

export const metadata: Metadata = { title: 'Tonight' };
export const dynamic = 'force-dynamic';

/** Game facts worth having on screen when everyone is standing around the table. */
function GameFacts({
  game,
}: {
  game: {
    minPlayers: number | null;
    maxPlayers: number | null;
    playingTime: number | null;
    averageWeight: number | null;
    minAge: number | null;
  };
}) {
  const facts = [
    game.minPlayers != null && game.maxPlayers != null
      ? `${game.minPlayers}–${game.maxPlayers} players`
      : null,
    game.playingTime != null ? `${game.playingTime} min` : null,
    game.averageWeight != null ? `complexity ${game.averageWeight.toFixed(1)}/5` : null,
    game.minAge != null ? `age ${game.minAge}+` : null,
  ].filter(Boolean);

  if (facts.length === 0) return null;
  return <p className="text-sm text-[var(--color-ink-soft)]">{facts.join(' · ')}</p>;
}

export default async function TonightPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const user = await requireUser(`/events/${eventId}/tonight`);
  const { event, membership } = await getEventForMember(eventId, user.id);

  const grouped = RSVP_GROUPS.map((group) => ({
    ...group,
    members: event.members.filter((member) => member.rsvp === group.status),
  }));
  const attending = grouped.find((group) => group.status === 'YES')?.members ?? [];

  const selection = event.selection;
  const backups = [selection?.backup1Game, selection?.backup2Game].filter(
    (game): game is NonNullable<typeof game> => Boolean(game),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Tonight"
        title={event.title}
        subtitle={
          <span className="flex flex-col gap-0.5">
            <span>
              <span aria-hidden="true">🗓 </span>
              {formatInZone(event.startsAt, event.timezone)}
            </span>
            <span>
              <span aria-hidden="true">📍 </span>
              {event.location}
            </span>
          </span>
        }
      />

      {selection ? (
        <Card className="border-2 border-[var(--color-coral-600)] bg-[var(--color-coral-50)]">
          <p className="text-sm font-semibold uppercase tracking-wide text-[var(--color-coral-700)]">
            We are playing
          </p>
          <h2 className="mt-1 text-2xl font-bold sm:text-3xl">
            {selection.primaryGame.bggUrl ? (
              <a
                href={selection.primaryGame.bggUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline-offset-4 hover:underline"
              >
                {selection.primaryGame.name}
              </a>
            ) : (
              selection.primaryGame.name
            )}
          </h2>
          <div className="mt-2">
            <GameFacts game={selection.primaryGame} />
          </div>

          <p className="mt-3 text-sm text-[var(--color-ink-soft)]">
            Locked in by {selection.selectedBy.name}
            {selection.method === 'PICK_FOR_US' ? ' with a random draw' : ''}
            {selection.primaryScoreSnapshot != null
              ? `, scoring ${selection.primaryScoreSnapshot}/100 at the time`
              : ''}
            .
          </p>
          {selection.notes ? (
            <p className="mt-2 text-sm">&ldquo;{selection.notes}&rdquo;</p>
          ) : null}

          {backups.length > 0 ? (
            <div className="mt-4">
              <h3 className="text-sm font-bold">If that falls through</h3>
              <ol className="mt-1 flex flex-col gap-1 text-sm">
                {backups.map((game, index) => (
                  <li key={game.id}>
                    <span className="text-[var(--color-ink-soft)]">{index + 1}. </span>
                    <span className="font-semibold">{game.name}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </Card>
      ) : (
        <EmptyState
          title="No game locked in yet"
          action={
            membership.isOrganizer ? (
              <ButtonLink href={`/events/${eventId}/recommendations`}>
                Choose a game
              </ButtonLink>
            ) : undefined
          }
        >
          {membership.isOrganizer
            ? 'Head to the recommendations to pick a primary game and up to two backups.'
            : 'The organizer has not decided yet. Add your preferences so they have something to work with.'}
        </EmptyState>
      )}

      <Card>
        <SectionHeading hint={`${attending.length} confirmed.`}>Who is here</SectionHeading>
        {attending.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-soft)]">Nobody has confirmed yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {attending.map((member) => (
              <li
                key={member.id}
                className="flex items-center gap-2 rounded-full bg-[var(--color-paper-sunken)] px-3 py-1 text-sm"
              >
                <span className="font-semibold">{member.user.name}</span>
                {member.role === 'ORGANIZER' ? <Badge tone="coral">Host</Badge> : null}
              </li>
            ))}
          </ul>
        )}

        {grouped
          .filter((group) => group.status !== 'YES' && group.members.length > 0)
          .map((group) => (
            <p key={group.status} className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <RsvpBadge rsvp={group.status} />
              <span className="text-[var(--color-ink-soft)]">
                {group.members.map((member) => member.user.name).join(', ')}
              </span>
            </p>
          ))}
      </Card>

      {event.attendeeNotes ? (
        <Card>
          <SectionHeading>Before you come</SectionHeading>
          <p className="whitespace-pre-line text-sm">{event.attendeeNotes}</p>
        </Card>
      ) : null}

      <BggAttribution />
    </div>
  );
}
