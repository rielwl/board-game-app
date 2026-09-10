import type { Metadata } from 'next';

import { BggAttribution } from '@/components/bgg-attribution';
import { GameSearch } from '@/components/game-search';
import { CollectionImportForm, ManualGameForm, UserGameControls } from '@/components/library-forms';
import { Alert, Badge, Card, EmptyState, PageHeader, SectionHeading } from '@/components/ui';
import { requireUser } from '@/lib/authz';
import { getCatalogProvider } from '@/lib/bgg';
import { prisma } from '@/lib/prisma';
import { getUserLibrary } from '@/server/events';

export const metadata: Metadata = { title: 'My games' };
export const dynamic = 'force-dynamic';

const FAMILIARITY_LABEL = {
  NEVER_PLAYED: 'Never played',
  PLAYED: 'Played it',
  CAN_TEACH: 'Can teach it',
} as const;

export default async function LibraryPage() {
  const user = await requireUser('/library');
  const [library, profile] = await Promise.all([
    getUserLibrary(user.id),
    prisma.user.findUnique({ where: { id: user.id }, select: { bggUsername: true } }),
  ]);

  const provider = getCatalogProvider();
  const offline = provider.id !== 'bgg';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="My games"
        subtitle="Your shelf. Mark what you can actually bring, and whether you can teach it."
      />

      {offline ? (
        <Alert tone="info" title="BoardGameGeek lookups are switched off">
          Meeple Night is running against its built-in sample catalog. Search and import still
          work against that list, and manual entry works exactly as normal.
        </Alert>
      ) : null}

      <Card>
        <SectionHeading hint="Find a game and add it to your shelf.">Add a game</SectionHeading>
        <GameSearch />
        <BggAttribution className="mt-4" providerId={provider.id} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionHeading hint="Bulk-add everything you own on BoardGameGeek.">
            Import a collection
          </SectionHeading>
          <CollectionImportForm defaultUsername={profile?.bggUsername ?? ''} />
          {offline ? (
            <p className="mt-3 text-xs text-[var(--color-ink-soft)]">
              In offline mode, try the sample usernames <code>demo</code> or{' '}
              <code>heavygamer</code>.
            </p>
          ) : null}
        </Card>

        <Card>
          <SectionHeading hint="For a prototype, a promo, or when BGG is down.">
            Add a game by hand
          </SectionHeading>
          <ManualGameForm />
        </Card>
      </div>

      <section aria-labelledby="shelf-heading">
        <h2 id="shelf-heading" className="mb-3 text-lg font-bold">
          Your shelf ({library.length})
        </h2>

        {library.length === 0 ? (
          <EmptyState title="Nothing on your shelf yet">
            Search for a game above, import your BoardGameGeek collection, or add one by hand.
          </EmptyState>
        ) : (
          <ul className="grid gap-4 lg:grid-cols-2">
            {library.map((row) => (
              <Card as="li" key={row.id} className="flex flex-col gap-3">
                <div>
                  <h3 className="text-base font-bold">
                    {row.game.bggUrl ? (
                      <a
                        href={row.game.bggUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline-offset-2 hover:underline"
                      >
                        {row.game.name}
                      </a>
                    ) : (
                      row.game.name
                    )}
                    {row.game.yearPublished ? (
                      <span className="ml-1 font-normal text-[var(--color-ink-soft)]">
                        ({row.game.yearPublished})
                      </span>
                    ) : null}
                  </h3>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge tone={row.available ? 'teal' : 'neutral'}>
                      <span aria-hidden="true">{row.available ? '✓' : '—'}</span>
                      {row.available ? 'Available' : 'Not available'}
                    </Badge>
                    <Badge tone={row.familiarity === 'CAN_TEACH' ? 'coral' : 'neutral'}>
                      {FAMILIARITY_LABEL[row.familiarity]}
                    </Badge>
                    {row.game.isExpansion ? <Badge tone="amber">Expansion</Badge> : null}
                    {row.game.source === 'MANUAL' ? <Badge>Added by hand</Badge> : null}
                  </div>

                  <p className="mt-2 text-xs text-[var(--color-ink-soft)]">
                    {[
                      row.game.minPlayers != null && row.game.maxPlayers != null
                        ? `${row.game.minPlayers}–${row.game.maxPlayers} players`
                        : null,
                      row.game.playingTime != null ? `${row.game.playingTime} min` : null,
                      row.game.averageWeight != null
                        ? `weight ${row.game.averageWeight.toFixed(1)}/5`
                        : 'weight unknown',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>

                  {row.game.isExpansion && row.game.baseGames.length > 0 ? (
                    <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                      Needs {row.game.baseGames.map((rel) => rel.baseGame.name).join(' or ')}.
                    </p>
                  ) : null}
                </div>

                <UserGameControls
                  userGameId={row.id}
                  available={row.available}
                  familiarity={row.familiarity}
                  notes={row.notes}
                  gameName={row.game.name}
                />
              </Card>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
