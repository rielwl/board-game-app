'use client';

import { useActionState } from 'react';

import {
  createManualGameAction,
  importCollectionAction,
  removeUserGameAction,
  updateUserGameAction,
} from '@/server/actions/library';
import { idleState } from '@/server/actions/shared';

import { FormFeedback, SubmitButton } from './form';
import { Field, describedBy, inputStyles } from './ui';

export function CollectionImportForm({ defaultUsername }: { defaultUsername: string }) {
  const [state, action] = useActionState(importCollectionAction, idleState);

  return (
    <form action={action} className="flex flex-col gap-4">
      <FormFeedback state={state} />
      <Field
        label="BoardGameGeek username"
        htmlFor="bggUsername"
        hint="We read the public collection for this username and import only the games marked as owned. We never ask for a BGG password."
        error={state.fieldErrors.bggUsername}
      >
        <input
          id="bggUsername"
          name="bggUsername"
          type="text"
          required
          defaultValue={defaultUsername}
          autoComplete="off"
          className={inputStyles}
          aria-describedby={describedBy(
            'bggUsername',
            true,
            Boolean(state.fieldErrors.bggUsername),
          )}
        />
      </Field>
      <div>
        <SubmitButton variant="secondary" pendingLabel="Importing…">
          Import owned games
        </SubmitButton>
      </div>
    </form>
  );
}

export function ManualGameForm() {
  const [state, action] = useActionState(createManualGameAction, idleState);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormFeedback state={state} />

      <Field label="Game name" htmlFor="manual-name" error={state.fieldErrors.name}>
        <input
          id="manual-name"
          name="name"
          type="text"
          required
          maxLength={160}
          className={inputStyles}
          aria-describedby={describedBy('manual-name', false, Boolean(state.fieldErrors.name))}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Minimum players" htmlFor="minPlayers" error={state.fieldErrors.minPlayers}>
          <input
            id="minPlayers"
            name="minPlayers"
            type="number"
            required
            min={1}
            max={30}
            defaultValue={2}
            inputMode="numeric"
            className={inputStyles}
          />
        </Field>
        <Field label="Maximum players" htmlFor="maxPlayers" error={state.fieldErrors.maxPlayers}>
          <input
            id="maxPlayers"
            name="maxPlayers"
            type="number"
            required
            min={1}
            max={99}
            defaultValue={4}
            inputMode="numeric"
            className={inputStyles}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Play time"
          htmlFor="playingTime"
          hint="Minutes"
          error={state.fieldErrors.playingTime}
        >
          <input
            id="playingTime"
            name="playingTime"
            type="number"
            min={1}
            max={1440}
            inputMode="numeric"
            className={inputStyles}
          />
        </Field>
        <Field
          label="Complexity"
          htmlFor="averageWeight"
          hint="1 (light) to 5 (heavy)"
          error={state.fieldErrors.averageWeight}
        >
          <input
            id="averageWeight"
            name="averageWeight"
            type="number"
            min={1}
            max={5}
            step={0.1}
            inputMode="decimal"
            className={inputStyles}
          />
        </Field>
        <Field label="Year" htmlFor="yearPublished" error={state.fieldErrors.yearPublished}>
          <input
            id="yearPublished"
            name="yearPublished"
            type="number"
            min={1900}
            max={2100}
            inputMode="numeric"
            className={inputStyles}
          />
        </Field>
      </div>

      <Field label="Notes" htmlFor="manual-notes" error={state.fieldErrors.notes}>
        <input id="manual-notes" name="notes" type="text" maxLength={500} className={inputStyles} />
      </Field>

      <div>
        <SubmitButton pendingLabel="Adding…">Add this game</SubmitButton>
      </div>
    </form>
  );
}

export function UserGameControls({
  userGameId,
  available,
  familiarity,
  notes,
  gameName,
}: {
  userGameId: string;
  available: boolean;
  familiarity: 'NEVER_PLAYED' | 'PLAYED' | 'CAN_TEACH';
  notes: string | null;
  gameName: string;
}) {
  const [saveState, saveAction] = useActionState(updateUserGameAction, idleState);
  const [removeState, removeAction] = useActionState(removeUserGameAction, idleState);

  const availableId = `available-${userGameId}`;
  const familiarityId = `familiarity-${userGameId}`;
  const notesId = `notes-${userGameId}`;

  return (
    <div className="flex flex-col gap-3">
      <FormFeedback state={saveState} />
      <FormFeedback state={removeState} />

      <form action={saveAction} className="flex flex-col gap-3">
        <input type="hidden" name="userGameId" value={userGameId} />

        <div className="flex flex-wrap items-end gap-4">
          <label htmlFor={availableId} className="flex items-center gap-2 text-sm font-semibold">
            <input
              id={availableId}
              name="available"
              type="checkbox"
              defaultChecked={available}
              className="h-4 w-4 accent-[var(--color-teal-600)]"
            />
            Available to bring
          </label>

          <div className="flex flex-col gap-1">
            <label htmlFor={familiarityId} className="text-sm font-semibold">
              How well do you know it?
            </label>
            <select
              id={familiarityId}
              name="familiarity"
              defaultValue={familiarity}
              className={inputStyles}
            >
              <option value="NEVER_PLAYED">Never played it</option>
              <option value="PLAYED">I have played it</option>
              <option value="CAN_TEACH">I can teach it</option>
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={notesId} className="text-sm font-semibold">
            Notes
          </label>
          <input
            id={notesId}
            name="notes"
            type="text"
            maxLength={500}
            defaultValue={notes ?? ''}
            placeholder="Missing the score pad"
            className={inputStyles}
          />
        </div>

        <div>
          <SubmitButton variant="secondary" pendingLabel="Saving…">
            Save
          </SubmitButton>
        </div>
      </form>

      <form action={removeAction}>
        <input type="hidden" name="userGameId" value={userGameId} />
        <SubmitButton variant="ghost" pendingLabel="Removing…">
          <span aria-hidden="true">Remove</span>
          <span className="sr-only">Remove {gameName} from my library</span>
        </SubmitButton>
      </form>
    </div>
  );
}
