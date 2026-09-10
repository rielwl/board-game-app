'use client';

import { useActionState, useState } from 'react';
import type { RsvpStatus } from '@prisma/client';

import { setRsvpAction } from '@/server/actions/events';
import { idleState } from '@/server/actions/shared';

import { FormFeedback, SubmitButton } from './form';
import { cx, inputStyles } from './ui';

const CHOICES: { value: Exclude<RsvpStatus, 'AWAITING'>; label: string; glyph: string }[] = [
  { value: 'YES', label: 'Yes, count me in', glyph: '✓' },
  { value: 'MAYBE', label: 'Maybe', glyph: '~' },
  { value: 'NO', label: "Can't make it", glyph: '✕' },
];

/**
 * RSVP control.
 *
 * Implemented as a radio group rather than three buttons so the current answer
 * is exposed to assistive technology and arrow keys work as expected.
 */
export function RsvpForm({
  eventId,
  current,
  currentNote,
  disabled,
}: {
  eventId: string;
  current: RsvpStatus;
  currentNote: string | null;
  disabled?: boolean;
}) {
  const [state, action] = useActionState(setRsvpAction, idleState);
  const [selected, setSelected] = useState<RsvpStatus>(current);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="eventId" value={eventId} />
      <FormFeedback state={state} />

      <fieldset disabled={disabled} className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">Are you coming?</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {CHOICES.map((choice) => {
            const isSelected = selected === choice.value;
            return (
              <label
                key={choice.value}
                className={cx(
                  'flex cursor-pointer items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-sm font-semibold transition-colors',
                  isSelected
                    ? 'border-[var(--color-coral-600)] bg-[var(--color-coral-50)]'
                    : 'border-[var(--color-line)] bg-[var(--color-paper-raised)] hover:bg-[var(--color-paper-sunken)]',
                  disabled && 'cursor-not-allowed opacity-60',
                )}
              >
                <input
                  type="radio"
                  name="rsvp"
                  value={choice.value}
                  checked={isSelected}
                  onChange={() => setSelected(choice.value)}
                  className="h-4 w-4 accent-[var(--color-coral-600)]"
                />
                <span aria-hidden="true">{choice.glyph}</span>
                {choice.label}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="rsvpNote" className="text-sm font-semibold">
          Note for the organizer <span className="font-normal text-[var(--color-ink-soft)]">(optional)</span>
        </label>
        <input
          id="rsvpNote"
          name="rsvpNote"
          type="text"
          maxLength={500}
          defaultValue={currentNote ?? ''}
          disabled={disabled}
          placeholder="Running late, start without me"
          className={inputStyles}
        />
      </div>

      {!disabled ? (
        <div>
          <SubmitButton pendingLabel="Saving…">
            {current === 'AWAITING' ? 'Send my answer' : 'Update my answer'}
          </SubmitButton>
        </div>
      ) : null}
    </form>
  );
}
