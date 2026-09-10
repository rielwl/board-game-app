'use client';

import { useActionState } from 'react';

import { createEventAction, updateEventAction } from '@/server/actions/events';
import { idleState } from '@/server/actions/shared';

import { FormFeedback, SubmitButton } from './form';
import { ButtonLink, Field, describedBy, inputStyles } from './ui';

export type EventFormValues = {
  eventId?: string;
  title: string;
  description: string;
  startsAtLocal: string;
  timezone: string;
  location: string;
  attendeeNotes: string;
  maxAttendees: string;
};

export function EventForm({
  mode,
  values,
  timezones,
}: {
  mode: 'create' | 'edit';
  values: EventFormValues;
  timezones: string[];
}) {
  const [state, action] = useActionState(
    mode === 'create' ? createEventAction : updateEventAction,
    idleState,
  );

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {values.eventId ? <input type="hidden" name="eventId" value={values.eventId} /> : null}
      <FormFeedback state={state} />

      <Field label="Title" htmlFor="title" error={state.fieldErrors.title}>
        <input
          id="title"
          name="title"
          type="text"
          required
          maxLength={120}
          defaultValue={values.title}
          placeholder="Thursday board games"
          className={inputStyles}
          aria-describedby={describedBy('title', false, Boolean(state.fieldErrors.title))}
        />
      </Field>

      <Field
        label="Description"
        htmlFor="description"
        hint="Optional. What kind of night is this?"
        error={state.fieldErrors.description}
      >
        <textarea
          id="description"
          name="description"
          rows={3}
          maxLength={2000}
          defaultValue={values.description}
          className={inputStyles}
          aria-describedby={describedBy(
            'description',
            true,
            Boolean(state.fieldErrors.description),
          )}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Starts"
          htmlFor="startsAtLocal"
          error={state.fieldErrors.startsAtLocal}
        >
          <input
            id="startsAtLocal"
            name="startsAtLocal"
            type="datetime-local"
            required
            defaultValue={values.startsAtLocal}
            className={inputStyles}
            aria-describedby={describedBy(
              'startsAtLocal',
              false,
              Boolean(state.fieldErrors.startsAtLocal),
            )}
          />
        </Field>

        <Field
          label="Timezone"
          htmlFor="timezone"
          hint="The start time above is read in this zone."
          error={state.fieldErrors.timezone}
        >
          <select
            id="timezone"
            name="timezone"
            required
            defaultValue={values.timezone}
            className={inputStyles}
            aria-describedby={describedBy('timezone', true, Boolean(state.fieldErrors.timezone))}
          >
            {timezones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field
        label="Location"
        htmlFor="location"
        hint="Only people you invite can see this."
        error={state.fieldErrors.location}
      >
        <input
          id="location"
          name="location"
          type="text"
          required
          maxLength={200}
          defaultValue={values.location}
          placeholder="42 Kite Street, back room"
          className={inputStyles}
          aria-describedby={describedBy('location', true, Boolean(state.fieldErrors.location))}
        />
      </Field>

      <Field
        label="Notes for attendees"
        htmlFor="attendeeNotes"
        hint="Optional. Parking, snacks, the dog situation."
        error={state.fieldErrors.attendeeNotes}
      >
        <textarea
          id="attendeeNotes"
          name="attendeeNotes"
          rows={2}
          maxLength={2000}
          defaultValue={values.attendeeNotes}
          className={inputStyles}
          aria-describedby={describedBy(
            'attendeeNotes',
            true,
            Boolean(state.fieldErrors.attendeeNotes),
          )}
        />
      </Field>

      <Field
        label="Maximum attendance"
        htmlFor="maxAttendees"
        hint="Optional. Leave blank for no limit."
        error={state.fieldErrors.maxAttendees}
      >
        <input
          id="maxAttendees"
          name="maxAttendees"
          type="number"
          min={1}
          max={100}
          inputMode="numeric"
          defaultValue={values.maxAttendees}
          className={inputStyles}
          aria-describedby={describedBy(
            'maxAttendees',
            true,
            Boolean(state.fieldErrors.maxAttendees),
          )}
        />
      </Field>

      <div className="flex flex-wrap gap-3">
        <SubmitButton pendingLabel={mode === 'create' ? 'Creating…' : 'Saving…'}>
          {mode === 'create' ? 'Create game night' : 'Save changes'}
        </SubmitButton>
        {values.eventId ? (
          <ButtonLink href={`/events/${values.eventId}`} variant="secondary">
            Cancel
          </ButtonLink>
        ) : (
          <ButtonLink href="/dashboard" variant="secondary">
            Cancel
          </ButtonLink>
        )}
      </div>
    </form>
  );
}
