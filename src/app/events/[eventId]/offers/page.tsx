import type { Metadata } from 'next';

import { OfferToggle } from '@/components/offer-toggle';
import { RsvpBadge } from '@/components/rsvp';
import { Badge, ButtonLink, Card, EmptyState, PageHeader, SectionHeading } from '@/components/ui';
import { requireUser } from '@/lib/authz';
import { getEventForMember, getLibraryForEvent } from '@/server/events';

export const metadata: Metadata = { title: 'Games for this night' };
export const dynamic = 'force-dynamic';

export default async function OffersPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const user = await requireUser(`/events/${eventId}/offers`);
  const [{ event }, library] = await Promise.all([
    getEventForMember(eventId, user.id),
    getLibraryForEvent(eventId, user.id),
  ]);

  const closed = event.status !== 'ACTIVE';
  const rsvpByUserId = new Map(event.members.map((member) => [member.userId, member.rsvp]));

  // Everything anybody has offered, grouped by game.
  const offersByGame = new Map<
    string,
    {
      name: string;
      isExpansion: boolean;
      players: string;
      time: string;
      owners: { userId: string; name: string }[];
    }
  >();
  for (const offer of event.offers) {
    const entry = offersByGame.get(offer.gameId) ?? {
      name: offer.game.name,
      isExpansion: offer.game.isExpansion,
      players:
        offer.game.minPlayers != null && offer.game.maxPlayers != null
          ? `${offer.game.minPlayers}–${offer.game.maxPlayers} players`
          : 'player count unknown',
      time: offer.game.playingTime != null ? `${offer.game.playingTime} min` : 'length unknown',
      owners: [],
    };
    entry.owners.push({ userId: offer.userId, name: offer.user.name });
    offersByGame.set(offer.gameId, entry);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Games for this night"
        subtitle="Offering a game is a promise to physically bring it. Owning one is not."
      />

      <Card>
        <SectionHeading hint={`${offersByGame.size} games promised so far.`}>
          On the table
        </SectionHeading>

        {offersByGame.size === 0 ? (
          <EmptyState title="Nobody has offered a game yet">
            Pick something from your shelf below and say you will bring it.
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-2">
            {[...offersByGame.entries()].map(([gameId, entry]) => (
              <li
                key={gameId}
                className="rounded-xl border border-[var(--color-line)] px-3 py-2.5 text-sm"
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-semibold">{entry.name}</span>
                  {entry.isExpansion ? <Badge tone="amber">Expansion</Badge> : null}
                  <span className="text-xs text-[var(--color-ink-soft)]">
                    {entry.players} · {entry.time}
                  </span>
                </div>
                <ul className="mt-1.5 flex flex-wrap gap-2">
                  {entry.owners.map((owner) => (
                    <li key={owner.userId} className="flex items-center gap-1.5 text-xs">
                      <span className="font-semibold">{owner.name}</span>
                      <RsvpBadge rsvp={rsvpByUserId.get(owner.userId) ?? 'AWAITING'} />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <SectionHeading hint="Toggle anything you can carry to this night.">
          Offer from your shelf
        </SectionHeading>

        {library.length === 0 ? (
          <EmptyState
            title="Your shelf is empty"
            action={<ButtonLink href="/library">Add some games</ButtonLink>}
          >
            Add games to your library first, then come back and offer them.
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {library.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-line)] px-3 py-2.5"
              >
                <div className="min-w-0 text-sm">
                  <p className="font-semibold">
                    {row.game.name}
                    {row.game.isExpansion ? (
                      <Badge tone="amber" className="ml-2">
                        Expansion
                      </Badge>
                    ) : null}
                  </p>
                  <p className="text-xs text-[var(--color-ink-soft)]">
                    {row.available ? 'Marked available' : 'Marked unavailable in your library'}
                    {row.familiarity === 'CAN_TEACH' ? ' · you can teach it' : ''}
                  </p>
                </div>

                <OfferToggle
                  eventId={eventId}
                  gameId={row.gameId}
                  gameName={row.game.name}
                  offering={row.offered}
                  disabled={closed || (!row.available && !row.offered)}
                  disabledReason={
                    closed
                      ? 'This event is closed'
                      : 'Mark it available in your library first'
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
