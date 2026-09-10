import type { RsvpStatus } from '@prisma/client';

import { cx } from './ui';

/**
 * RSVP status pill.
 *
 * Each state carries a distinct glyph and its own word as well as a colour, so
 * the status survives greyscale, colour blindness and screen readers.
 */
const RSVP_PRESENTATION: Record<
  RsvpStatus,
  { label: string; glyph: string; className: string; description: string }
> = {
  YES: {
    label: 'Yes',
    glyph: '✓',
    className: 'bg-[var(--color-teal-100)] text-[var(--color-teal-700)]',
    description: 'Coming',
  },
  MAYBE: {
    label: 'Maybe',
    glyph: '~',
    className: 'bg-[var(--color-amber-50)] text-[var(--color-amber-700)]',
    description: 'Might come',
  },
  NO: {
    label: 'No',
    glyph: '✕',
    className: 'bg-[var(--color-coral-100)] text-[var(--color-coral-700)]',
    description: 'Not coming',
  },
  AWAITING: {
    label: 'Awaiting response',
    glyph: '…',
    className: 'bg-[var(--color-slate-tint)] text-[var(--color-slate-deep)]',
    description: 'Has not answered yet',
  },
};

export function RsvpBadge({ rsvp, className }: { rsvp: RsvpStatus; className?: string }) {
  const presentation = RSVP_PRESENTATION[rsvp];
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold',
        presentation.className,
        className,
      )}
    >
      <span aria-hidden="true" className="font-bold">
        {presentation.glyph}
      </span>
      {presentation.label}
      <span className="sr-only"> — {presentation.description}</span>
    </span>
  );
}

export const RSVP_GROUPS: { status: RsvpStatus; heading: string }[] = [
  { status: 'YES', heading: 'Yes' },
  { status: 'MAYBE', heading: 'Maybe' },
  { status: 'NO', heading: 'No' },
  { status: 'AWAITING', heading: 'Awaiting response' },
];
