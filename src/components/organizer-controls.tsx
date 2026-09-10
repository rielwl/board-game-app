'use client';

import { useActionState } from 'react';

import {
  clearSelectionAction,
  lockPickAction,
  lockSelectionAction,
  pickForUsAction,
  type PickForUsPayload,
} from '@/server/actions/event-games';
import { updateRecommendationSettingsAction } from '@/server/actions/events';
import { idleState } from '@/server/actions/state';

import { FormFeedback, SubmitButton } from './form';
import { Alert, Field, describedBy, inputStyles } from './ui';

export function RecommendationSettingsForm({
  eventId,
  defaultTargetPlayerCount,
  values,
}: {
  eventId: string;
  defaultTargetPlayerCount: number;
  values: { targetPlayerCount: string; maxDurationMinutes: string; complexityTarget: string };
}) {
  const [state, action] = useActionState(updateRecommendationSettingsAction, idleState);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="eventId" value={eventId} />
      <FormFeedback state={state} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Target player count"
          htmlFor="targetPlayerCount"
          hint={`Blank uses the ${defaultTargetPlayerCount} confirmed Yes ${
            defaultTargetPlayerCount === 1 ? 'attendee' : 'attendees'
          }.`}
          error={state.fieldErrors.targetPlayerCount}
        >
          <input
            id="targetPlayerCount"
            name="targetPlayerCount"
            type="number"
            min={1}
            max={30}
            inputMode="numeric"
            defaultValue={values.targetPlayerCount}
            placeholder={String(defaultTargetPlayerCount)}
            className={inputStyles}
            aria-describedby={describedBy(
              'targetPlayerCount',
              true,
              Boolean(state.fieldErrors.targetPlayerCount),
            )}
          />
        </Field>

        <Field
          label="Hard time limit"
          htmlFor="maxDurationMinutes"
          hint="Minutes. Longer games become ineligible."
          error={state.fieldErrors.maxDurationMinutes}
        >
          <input
            id="maxDurationMinutes"
            name="maxDurationMinutes"
            type="number"
            min={5}
            max={1440}
            inputMode="numeric"
            defaultValue={values.maxDurationMinutes}
            className={inputStyles}
            aria-describedby={describedBy(
              'maxDurationMinutes',
              true,
              Boolean(state.fieldErrors.maxDurationMinutes),
            )}
          />
        </Field>

        <Field
          label="Complexity target"
          htmlFor="complexityTarget"
          hint="1 to 5. A soft nudge, not a filter."
          error={state.fieldErrors.complexityTarget}
        >
          <input
            id="complexityTarget"
            name="complexityTarget"
            type="number"
            min={1}
            max={5}
            step={0.1}
            inputMode="decimal"
            defaultValue={values.complexityTarget}
            className={inputStyles}
            aria-describedby={describedBy(
              'complexityTarget',
              true,
              Boolean(state.fieldErrors.complexityTarget),
            )}
          />
        </Field>
      </div>

      <div>
        <SubmitButton variant="secondary" pendingLabel="Applying…">
          Apply settings
        </SubmitButton>
      </div>
    </form>
  );
}

export function SelectionForm({
  eventId,
  eligible,
  current,
  hasSelection,
}: {
  eventId: string;
  eligible: { gameId: string; name: string; total: number }[];
  current: { primaryGameId: string; backup1GameId: string | null; backup2GameId: string | null } | null;
  hasSelection: boolean;
}) {
  const [state, action] = useActionState(lockSelectionAction, idleState);
  const [clearState, clearAction] = useActionState(clearSelectionAction, idleState);

  if (eligible.length === 0) {
    return (
      <Alert tone="info">
        There is nothing eligible to lock in yet. Adjust the settings above, or wait for more
        RSVPs and game offers.
      </Alert>
    );
  }

  const options = eligible.map((game) => (
    <option key={game.gameId} value={game.gameId}>
      {game.name} — {game.total}/100
    </option>
  ));

  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="eventId" value={eventId} />
        <FormFeedback state={state} />

        <Field
          label="Primary game"
          htmlFor="primaryGameId"
          error={state.fieldErrors.primaryGameId}
        >
          <select
            id="primaryGameId"
            name="primaryGameId"
            required
            defaultValue={current?.primaryGameId ?? eligible[0]?.gameId}
            className={inputStyles}
          >
            {options}
          </select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="First backup"
            htmlFor="backup1GameId"
            hint="Optional"
            error={state.fieldErrors.backup1GameId}
          >
            <select
              id="backup1GameId"
              name="backup1GameId"
              defaultValue={current?.backup1GameId ?? ''}
              className={inputStyles}
            >
              <option value="">No backup</option>
              {options}
            </select>
          </Field>

          <Field
            label="Second backup"
            htmlFor="backup2GameId"
            hint="Optional"
            error={state.fieldErrors.backup2GameId}
          >
            <select
              id="backup2GameId"
              name="backup2GameId"
              defaultValue={current?.backup2GameId ?? ''}
              className={inputStyles}
            >
              <option value="">No backup</option>
              {options}
            </select>
          </Field>
        </div>

        <Field label="Note" htmlFor="selection-notes" hint="Optional. Shown on the Tonight page.">
          <input
            id="selection-notes"
            name="notes"
            type="text"
            maxLength={500}
            className={inputStyles}
          />
        </Field>

        <div>
          <SubmitButton pendingLabel="Locking in…">
            {hasSelection ? 'Update the pick' : 'Lock this in'}
          </SubmitButton>
        </div>
      </form>

      {hasSelection ? (
        <form action={clearAction}>
          <input type="hidden" name="eventId" value={eventId} />
          <FormFeedback state={clearState} />
          <SubmitButton variant="ghost" pendingLabel="Clearing…">
            Clear the current selection
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}

/**
 * "Pick for us": a weighted random draw over the top eligible games.
 *
 * The draw happens on the server and is returned without being saved, so the
 * organizer can reroll as many times as they like before committing.
 */
export function PickForUs({ eventId, canPick }: { eventId: string; canPick: boolean }) {
  const [pickState, pickAction] = useActionState(pickForUsAction, idleState);
  const [lockState, lockAction] = useActionState(lockPickAction, idleState);

  const payload = pickState.status === 'success' ? (pickState.data as PickForUsPayload) : null;

  return (
    <div className="flex flex-col gap-4">
      <form action={pickAction}>
        <input type="hidden" name="eventId" value={eventId} />
        <SubmitButton variant="teal" pendingLabel="Rolling…">
          <span aria-hidden="true">🎲</span>
          {payload ? 'Roll again' : 'Pick for us'}
        </SubmitButton>
      </form>

      {pickState.status === 'error' ? <FormFeedback state={pickState} /> : null}

      {payload ? (
        <div
          aria-live="polite"
          data-testid="pick-result"
          className="rounded-xl border-2 border-[var(--color-teal-600)] bg-[var(--color-teal-50)] p-4"
        >
          <p className="text-sm text-[var(--color-teal-700)]">The dice say…</p>
          <p className="text-xl font-bold">{payload.name}</p>
          <p className="mt-1 text-sm text-[var(--color-teal-700)]">
            Scored {payload.total}/100.
          </p>

          <details className="mt-2">
            <summary className="cursor-pointer text-xs font-semibold text-[var(--color-teal-700)]">
              What were the odds?
            </summary>
            <ul className="mt-1 text-xs text-[var(--color-teal-700)]">
              {payload.pool.map((entry) => (
                <li key={entry.gameId}>
                  {entry.name}: {Math.round(entry.probability * 100)}%
                </li>
              ))}
            </ul>
          </details>

          <form action={lockAction} className="mt-3">
            <input type="hidden" name="eventId" value={eventId} />
            <input type="hidden" name="gameId" value={payload.gameId} />
            <SubmitButton pendingLabel="Locking in…">Lock in {payload.name}</SubmitButton>
          </form>
          <div className="mt-2">
            <FormFeedback state={lockState} />
          </div>
        </div>
      ) : null}

      {!canPick ? (
        <p className="text-sm text-[var(--color-ink-soft)]">
          Nothing is eligible yet, so there is nothing to roll for.
        </p>
      ) : null}
    </div>
  );
}
