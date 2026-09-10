import { redirect } from 'next/navigation';

import { BggAttribution } from '@/components/bgg-attribution';
import { ButtonLink, Card } from '@/components/ui';
import { getSessionUser } from '@/lib/authz';

const STEPS = [
  {
    emoji: '📅',
    title: 'Set the night',
    body: 'Pick a date, a place and how many people fit around the table.',
  },
  {
    emoji: '🔗',
    title: 'Share one link',
    body: 'Everything stays private. Only people with your invite link can see the details.',
  },
  {
    emoji: '🎲',
    title: 'Collect games and preferences',
    body: 'Everyone says what they can bring, how heavy a game they want, and how long they have.',
  },
  {
    emoji: '🏆',
    title: 'Get a ranked shortlist',
    body: 'A transparent score explains every suggestion — no black box, no guessing.',
  },
];

export default async function LandingPage() {
  const user = await getSessionUser();
  if (user) redirect('/dashboard');

  return (
    <div className="flex flex-col gap-10">
      <section className="text-center">
        <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-[var(--color-coral-700)]">
          For the group chat that never decides
        </p>
        <h1 className="text-balance text-3xl font-bold sm:text-5xl">
          Pick the right game before everyone arrives
        </h1>
        <p className="mx-auto mt-4 max-w-prose text-pretty text-base text-[var(--color-ink-soft)] sm:text-lg">
          Meeple Night collects who is coming, what they can bring and what they feel like
          playing, then ranks the games that actually work for tonight&rsquo;s table.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/sign-up">Start a game night</ButtonLink>
          <ButtonLink href="/sign-in" variant="secondary">
            I already have an account
          </ButtonLink>
        </div>
      </section>

      <section aria-labelledby="how-it-works">
        <h2 id="how-it-works" className="sr-only">
          How it works
        </h2>
        <ol className="grid gap-4 sm:grid-cols-2">
          {STEPS.map((step, index) => (
            <Card as="li" key={step.title} className="flex gap-3">
              <span aria-hidden="true" className="text-2xl">
                {step.emoji}
              </span>
              <div>
                <h3 className="font-bold">
                  <span className="text-[var(--color-ink-soft)]">{index + 1}. </span>
                  {step.title}
                </h3>
                <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{step.body}</p>
              </div>
            </Card>
          ))}
        </ol>
      </section>

      <Card className="text-center">
        <h2 className="text-lg font-bold">No algorithms you cannot read</h2>
        <p className="mx-auto mt-2 max-w-prose text-sm text-[var(--color-ink-soft)]">
          Every recommendation shows its score out of 100, broken into player count fit,
          complexity fit, length, who asked for it, community rating and whether somebody at
          the table can teach it. If nothing fits, it tells you exactly what got in the way.
        </p>
        <BggAttribution className="mt-4" />
      </Card>
    </div>
  );
}
