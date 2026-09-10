import type { Metadata } from 'next';

import { BggAttribution } from '@/components/bgg-attribution';
import { Card, PageHeader, SectionHeading } from '@/components/ui';

export const metadata: Metadata = { title: 'About the data' };

export default function AboutPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader
        title="About the data"
        subtitle="Where game information comes from, and what we do with it."
      />

      <Card>
        <SectionHeading>BoardGameGeek</SectionHeading>
        <div className="flex flex-col gap-3 text-sm">
          <p>
            Game names, player counts, play times, complexity ratings, community player-count
            polls and cover art come from BoardGameGeek&rsquo;s public XML API2. Every request is
            made from our server, throttled conservatively, and cached so that ordinary page
            loads never touch BGG.
          </p>
          <p>
            We only use the documented API. We never scrape BGG&rsquo;s web pages, never use
            undocumented endpoints, and never ask for or store a BoardGameGeek password. A
            collection import reads only the public collection for the username you supply, and
            imports only the items marked as owned.
          </p>
          <p>
            BoardGameGeek data is made available for non-commercial use. Meeple Night is a
            non-commercial tool and uses it on that basis.
          </p>
          <BggAttribution />
        </div>
      </Card>

      <Card>
        <SectionHeading>Recommendations</SectionHeading>
        <div className="flex flex-col gap-3 text-sm">
          <p>
            Recommendations are produced by a deterministic scoring function that runs entirely
            on our own server. There is no machine learning model and no language model involved,
            and nothing about your group or your games is sent to a third-party AI service.
          </p>
          <p>
            The same inputs always produce the same ranking, and every score is broken into its
            six components so you can see exactly why a game came out on top.
          </p>
        </div>
      </Card>

      <Card>
        <SectionHeading>Privacy</SectionHeading>
        <div className="flex flex-col gap-3 text-sm">
          <p>
            Events are private. Their details, including the location and the guest list, are
            visible only to people who have joined through an invite link. Invite links are long
            random tokens, can be given an expiry date and a use limit, and can be revoked at any
            time.
          </p>
        </div>
      </Card>
    </div>
  );
}
