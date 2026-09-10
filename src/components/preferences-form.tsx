'use client';

import { useActionState } from 'react';

import { savePreferencesAction } from '@/server/actions/event-games';
import { idleState } from '@/server/actions/shared';

import { FormFeedback, SubmitButton } from './form';
import { Field, cx, describedBy, inputStyles } from './ui';

const NOVELTY = [
  { value: 'EITHER', label: 'Either is fine', glyph: '↔' },
  { value: 'FAMILIAR', label: 'Something familiar', glyph: '♻' },
  { value: 'NEW', label: 'Something new', glyph: '✨' },
] as const;

export function PreferencesForm({
  eventId,
  values,
  disabled,
}: {
  eventId: string;
  values: {
    minComplexity: string;
    maxComplexity: string;
    maxPlayTime: string;
    noveltyPreference: 'FAMILIAR' | 'NEW' | 'EITHER';
    note: string;
  };
  disabled?: boolean;
}) {
  const [state, action] = useActionState(savePreferencesAction, idleState);

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="eventId" value={eventId} />
      <FormFeedback state={state} />

      <fieldset disabled={disabled} className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Lightest you would enjoy"
            htmlFor="minComplexity"
            hint="1 is a party game, 5 is a brain burner. Leave blank for no preference."
            error={state.fieldErrors.minComplexity}
          >
            <input
              id="minComplexity"
              name="minComplexity"
              type="number"
              min={1}
              max={5}
              step={0.5}
              inputMode="decimal"
              defaultValue={values.minComplexity}
              className={inputStyles}
              aria-describedby={describedBy(
                'minComplexity',
                true,
                Boolean(state.fieldErrors.minComplexity),
              )}
            />
          </Field>

          <Field
            label="Heaviest you would enjoy"
            htmlFor="maxComplexity"
            hint="Also 1 to 5."
            error={state.fieldErrors.maxComplexity}
          >
            <input
              id="maxComplexity"
              name="maxComplexity"
              type="number"
              min={1}
              max={5}
              step={0.5}
              inputMode="decimal"
              defaultValue={values.maxComplexity}
              className={inputStyles}
              aria-describedby={describedBy(
                'maxComplexity',
                true,
                Boolean(state.fieldErrors.maxComplexity),
              )}
            />
          </Field>
        </div>

        <Field
          label="Longest you want to play"
          htmlFor="maxPlayTime"
          hint="Minutes. Leave blank if you have all night."
          error={state.fieldErrors.maxPlayTime}
        >
          <input
            id="maxPlayTime"
            name="maxPlayTime"
            type="number"
            min={5}
            max={1440}
            inputMode="numeric"
            defaultValue={values.maxPlayTime}
            className={inputStyles}
            aria-describedby={describedBy(
              'maxPlayTime',
              true,
              Boolean(state.fieldErrors.maxPlayTime),
            )}
          />
        </Field>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">Familiar or new?</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {NOVELTY.map((option) => (
              <label
                key={option.value}
                className={cx(
                  'flex cursor-pointer items-center gap-2 rounded-xl border-2 border-[var(--color-line)] px-3 py-2 text-sm font-semibold',
                  'has-checked:border-[var(--color-coral-600)] has-checked:bg-[var(--color-coral-50)]',
                )}
              >
                <input
                  type="radio"
                  name="noveltyPreference"
                  value={option.value}
                  defaultChecked={values.noveltyPreference === option.value}
                  className="h-4 w-4 accent-[var(--color-coral-600)]"
                />
                <span aria-hidden="true">{option.glyph}</span>
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        <Field
          label="Anything else?"
          htmlFor="note"
          hint="Optional. The organizer sees this."
          error={state.fieldErrors.note}
        >
          <input
            id="note"
            name="note"
            type="text"
            maxLength={500}
            defaultValue={values.note}
            placeholder="Please not another three-hour war game"
            className={inputStyles}
          />
        </Field>

        {!disabled ? (
          <div>
            <SubmitButton pendingLabel="Saving…">Save my preferences</SubmitButton>
          </div>
        ) : null}
      </fieldset>
    </form>
  );
}
