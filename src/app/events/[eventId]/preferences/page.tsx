import type { Metadata } from 'next';

import { PreferencesForm } from '@/components/preferences-form';
import { RequestToggle } from '@/components/offer-toggle';
import { Badge, ButtonLink, Card, EmptyState, PageHeader, SectionHeading } from '@/components/ui';
import { requireUser } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { getEventForMember } from '@/server/events';

export const metadata: Metadata = { title: 'Your preferences' };
export const dynamic = 'force-dynamic';

const NOVELTY_LABEL = {
  FAMILIAR: 'prefers something familiar',
  NEW: 'prefers something new',
  EITHER: 'happy either way',
} as const;

export default async function PreferencesPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const user = await requireUser(`/events/${eventId}/preferences`);
  const { event } = await getEventForMember(eventId, user.id);

  const closed = event.status !== 'ACTIVE';
  const mine = event.preferences.find((preference) => preference.userId === user.id);
  const myRequests = new Set(
    event.requests.filter((request) => request.userId === user.id).map((request) => request.gameId),
  );

  // You can request anything anybody has offered, plus anything on your shelf.
  const requestable = await prisma.game.findMany({
    where: {
      OR: [
        { offers: { some: { eventId } } },
        { ownedBy: { some: { userId: user.id } } },
      ],
      isExpansion: false,
    },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, minPlayers: true, maxPlayers: true },
  });

  const requestCounts = new Map<string, number>();
  for (const request of event.requests) {
    requestCounts.set(request.gameId, (requestCounts.get(request.gameId) ?? 0) + 1);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="What are you in the mood for?"
        subtitle="This feeds straight into the recommendations. Everything here is optional."
      />

      <Card>
        <SectionHeading>Your preferences</SectionHeading>
        <PreferencesForm
          eventId={eventId}
          disabled={closed}
          values={{
            minComplexity: mine?.minComplexity != null ? String(mine.minComplexity) : '',
            maxComplexity: mine?.maxComplexity != null ? String(mine.maxComplexity) : '',
            maxPlayTime: mine?.maxPlayTime != null ? String(mine.maxPlayTime) : '',
            noveltyPreference: mine?.noveltyPreference ?? 'EITHER',
            note: mine?.note ?? '',
          }}
        />
      </Card>

      <Card>
        <SectionHeading hint="Requests are worth up to 20 of the 100 points a game can score.">
          Games you would like to play
        </SectionHeading>

        {requestable.length === 0 ? (
          <EmptyState
            title="Nothing to request yet"
            action={<ButtonLink href="/library">Add games to your shelf</ButtonLink>}
          >
            Once games are on your shelf or somebody offers one, you can ask for it here.
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-2">
            {requestable.map((game) => {
              const count = requestCounts.get(game.id) ?? 0;
              return (
                <li
                  key={game.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-line)] px-3 py-2"
                >
                  <span className="text-sm font-semibold">
                    {game.name}
                    {count > 0 ? (
                      <Badge tone="coral" className="ml-2">
                        {count} {count === 1 ? 'request' : 'requests'}
                      </Badge>
                    ) : null}
                  </span>
                  {closed ? (
                    <span className="text-xs text-[var(--color-ink-soft)]">Event closed</span>
                  ) : (
                    <RequestToggle
                      eventId={eventId}
                      gameId={game.id}
                      gameName={game.name}
                      requesting={myRequests.has(game.id)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <SectionHeading hint="What everyone else has told the organizer.">
          The group so far
        </SectionHeading>
        {event.preferences.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-soft)]">
            Nobody has filled anything in yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {event.preferences.map((preference) => (
              <li key={preference.id} className="rounded-xl bg-[var(--color-paper-sunken)]/60 px-3 py-2">
                <p className="font-semibold">{preference.user.name}</p>
                <p className="text-[var(--color-ink-soft)]">
                  {[
                    preference.minComplexity != null || preference.maxComplexity != null
                      ? `complexity ${preference.minComplexity ?? 1}–${preference.maxComplexity ?? 5}`
                      : 'any complexity',
                    preference.maxPlayTime != null
                      ? `up to ${preference.maxPlayTime} min`
                      : 'any length',
                    NOVELTY_LABEL[preference.noveltyPreference],
                  ].join(' · ')}
                </p>
                {preference.note ? (
                  <p className="mt-0.5">&ldquo;{preference.note}&rdquo;</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
