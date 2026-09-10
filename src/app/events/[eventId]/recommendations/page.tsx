import type { Metadata } from 'next';

import { BggAttribution } from '@/components/bgg-attribution';
import { PickForUs, RecommendationSettingsForm, SelectionForm } from '@/components/organizer-controls';
import { NearMissCard, ScoreCard } from '@/components/score-card';
import { Alert, ButtonLink, Card, EmptyState, PageHeader, SectionHeading } from '@/components/ui';
import { requireUser } from '@/lib/authz';
import { getCatalogProvider } from '@/lib/bgg';
import { getEventForMember } from '@/server/events';
import { getEventRecommendations } from '@/server/recommendations';

export const metadata: Metadata = { title: 'Recommendations' };
export const dynamic = 'force-dynamic';

export default async function RecommendationsPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const user = await requireUser(`/events/${eventId}/recommendations`);
  const [{ event, membership }, result] = await Promise.all([
    getEventForMember(eventId, user.id),
    getEventRecommendations(eventId),
  ]);

  const provider = getCatalogProvider();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="What should we play?"
        subtitle={
          <>
            Ranked for {result.targetPlayerCount}{' '}
            {result.targetPlayerCount === 1 ? 'player' : 'players'} · {result.yesCount} said yes
            {result.maybeCount > 0 ? `, ${result.maybeCount} said maybe (not counted)` : ''}
            {event.maxDurationMinutes ? ` · under ${event.maxDurationMinutes} min` : ''}
          </>
        }
      />

      {membership.isOrganizer ? (
        <Card>
          <SectionHeading hint="These change the hard rules and the scoring, and everyone sees the result.">
            Tune the recommendations
          </SectionHeading>
          <RecommendationSettingsForm
            eventId={eventId}
            defaultTargetPlayerCount={result.yesCount}
            values={{
              targetPlayerCount:
                event.targetPlayerCount != null ? String(event.targetPlayerCount) : '',
              maxDurationMinutes:
                event.maxDurationMinutes != null ? String(event.maxDurationMinutes) : '',
              complexityTarget:
                event.complexityTarget != null ? String(event.complexityTarget) : '',
            }}
          />
        </Card>
      ) : null}

      {result.unavailableOffers.length > 0 ? (
        <Alert tone="warning" title="Some offered games are no longer available">
          <ul className="mt-1 list-inside list-disc">
            {result.unavailableOffers.map((offer) => (
              <li key={`${offer.gameId}-${offer.ownerName}`}>
                {offer.gameName} — {offer.ownerName} marked it unavailable, so it is out of the
                running.
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <section aria-labelledby="ranked-heading">
        <h2 id="ranked-heading" className="mb-3 text-lg font-bold">
          Play tonight
        </h2>

        {result.recommendations.length === 0 ? (
          <EmptyState
            title="Nothing fits yet"
            action={<ButtonLink href={`/events/${eventId}/offers`}>Offer a game</ButtonLink>}
          >
            {result.noEligibleGamesReason}
          </EmptyState>
        ) : (
          <ul className="flex flex-col gap-4">
            {result.recommendations.map((recommendation, index) => (
              <ScoreCard
                key={recommendation.gameId}
                recommendation={recommendation}
                rank={index + 1}
              />
            ))}
          </ul>
        )}
      </section>

      {result.nearMisses.length > 0 ? (
        <section aria-labelledby="near-misses-heading">
          <h2 id="near-misses-heading" className="mb-1 text-lg font-bold">
            Close, but ruled out
          </h2>
          <p className="mb-3 text-sm text-[var(--color-ink-soft)]">
            These are offered but fail at least one hard rule, so they are kept out of the ranking
            above.
          </p>
          <ul className="flex flex-col gap-3">
            {result.nearMisses.map((nearMiss) => (
              <NearMissCard key={nearMiss.gameId} nearMiss={nearMiss} />
            ))}
          </ul>
        </section>
      ) : null}

      {membership.isOrganizer ? (
        <>
          <Card>
            <SectionHeading hint="Only games that pass every hard rule can be locked in.">
              Lock in the pick
            </SectionHeading>
            <SelectionForm
              eventId={eventId}
              eligible={result.recommendations.map((r) => ({
                gameId: r.gameId,
                name: r.name,
                total: r.total,
              }))}
              current={
                event.selection
                  ? {
                      primaryGameId: event.selection.primaryGameId,
                      backup1GameId: event.selection.backup1GameId,
                      backup2GameId: event.selection.backup2GameId,
                    }
                  : null
              }
              hasSelection={Boolean(event.selection)}
            />
          </Card>

          <Card>
            <SectionHeading hint="A weighted random draw from the top three eligible games. Roll as many times as you like.">
              Can&rsquo;t decide?
            </SectionHeading>
            <PickForUs eventId={eventId} canPick={result.recommendations.length > 0} />
          </Card>
        </>
      ) : null}

      <Card>
        <SectionHeading hint="Nobody currently owns these, so they are not part of tonight's ranking.">
          Discover for next time
        </SectionHeading>
        <EmptyState title="Coming in a later release">
          This is where Meeple Night will suggest games nobody at the table owns yet, filtered by
          your player count, length and complexity, drawn from a cached, approved candidate
          catalog. It is kept deliberately separate from the &ldquo;play tonight&rdquo; list above
          so a wish list never gets mistaken for a plan.
        </EmptyState>
      </Card>

      <BggAttribution providerId={provider.id} />
    </div>
  );
}
