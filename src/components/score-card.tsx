import { WEIGHTS, type NearMiss, type Recommendation } from '@/domain/recommendation';

import { RsvpBadge } from './rsvp';
import { Badge, Card, cx } from './ui';

const COMPONENT_LABELS: { key: keyof typeof WEIGHTS; label: string }[] = [
  { key: 'playerCount', label: 'Player count' },
  { key: 'complexity', label: 'Complexity fit' },
  { key: 'duration', label: 'Length' },
  { key: 'requests', label: 'Requested' },
  { key: 'rating', label: 'Community rating' },
  { key: 'teaching', label: 'Someone can teach' },
];

/**
 * One recommendation, with its score fully broken down.
 *
 * The bars are decorative; every number they encode is also written out, so
 * the explanation survives without colour or layout.
 */
export function ScoreCard({
  recommendation,
  rank,
  children,
}: {
  recommendation: Recommendation;
  rank: number;
  children?: React.ReactNode;
}) {
  const { components, total, reasons, warnings, offeredBy, confidence } = recommendation;

  return (
    <Card as="li" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-bold">
            <span className="text-[var(--color-ink-soft)]">#{rank} </span>
            {recommendation.name}
          </h3>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--color-ink-soft)]">
            <span>Brought by</span>
            {offeredBy.map((owner) => (
              <span key={owner.userId} className="inline-flex items-center gap-1">
                <span className="font-semibold text-[var(--color-ink)]">{owner.name}</span>
                <RsvpBadge rsvp={owner.rsvp} />
              </span>
            ))}
          </p>
        </div>

        <div className="text-right">
          <p className="text-2xl font-bold tabular-nums">
            {total}
            <span className="text-sm font-normal text-[var(--color-ink-soft)]">/100</span>
          </p>
          {confidence < 1 ? (
            <p className="text-xs text-[var(--color-ink-soft)]">
              {Math.round(confidence * 100)}% confidence
            </p>
          ) : null}
        </div>
      </div>

      <details className="rounded-xl bg-[var(--color-paper-sunken)]/60 px-3 py-2">
        <summary className="cursor-pointer text-sm font-semibold">
          How this scored {total} out of 100
        </summary>
        <table className="mt-3 w-full text-sm">
          <caption className="sr-only">
            Score breakdown for {recommendation.name}, out of 100 points
          </caption>
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-[var(--color-ink-soft)]">
              <th scope="col" className="pb-1 font-semibold">
                Factor
              </th>
              <th scope="col" className="pb-1 text-right font-semibold">
                Score
              </th>
            </tr>
          </thead>
          <tbody>
            {COMPONENT_LABELS.map(({ key, label }) => {
              const value = components[key];
              const max = WEIGHTS[key];
              return (
                <tr key={key} className="border-t border-[var(--color-line)]">
                  <th scope="row" className="py-1.5 pr-2 text-left font-normal">
                    {label}
                    <span
                      aria-hidden="true"
                      className="mt-1 block h-1.5 w-full max-w-40 overflow-hidden rounded-full bg-[var(--color-line)]"
                    >
                      <span
                        className="block h-full rounded-full bg-[var(--color-teal-600)]"
                        style={{ width: `${Math.round((value / max) * 100)}%` }}
                      />
                    </span>
                  </th>
                  <td className="py-1.5 text-right tabular-nums">
                    {value} / {max}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </details>

      {reasons.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {reasons.map((reason) => (
            <li key={reason}>
              <Badge tone="teal">
                <span aria-hidden="true">✓</span> {reason}
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}

      {warnings.length > 0 ? (
        <div>
          <h4 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">
            Worth knowing
          </h4>
          <ul className="flex flex-wrap gap-1.5">
            {warnings.map((warning) => (
              <li key={warning}>
                <Badge tone="amber">
                  <span aria-hidden="true">!</span> {warning}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {children}
    </Card>
  );
}

/** A game that failed at least one hard rule, shown separately and greyed. */
export function NearMissCard({ nearMiss }: { nearMiss: NearMiss }) {
  return (
    <Card as="li" className={cx('flex flex-col gap-2 border-dashed')}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-bold">{nearMiss.name}</h3>
        <p className="text-sm text-[var(--color-ink-soft)]">
          would have scored {nearMiss.hypotheticalTotal}/100
        </p>
      </div>

      <ul className="flex flex-col gap-1 text-sm">
        {nearMiss.failures.map((failure) => (
          <li key={failure.rule} className="flex gap-2">
            <span aria-hidden="true" className="text-[var(--color-coral-700)]">
              ✕
            </span>
            <span>{failure.reason}</span>
          </li>
        ))}
      </ul>

      {nearMiss.warnings.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {nearMiss.warnings.slice(0, 4).map((warning) => (
            <li key={warning}>
              <Badge>{warning}</Badge>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
