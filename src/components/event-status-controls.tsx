'use client';

import { useActionState } from 'react';
import type { EventStatus } from '@prisma/client';

import { setEventStatusAction } from '@/server/actions/events';
import { idleState } from '@/server/actions/state';

import { FormFeedback, SubmitButton } from './form';

/** Cancel / archive / reopen. Destructive-sounding actions are never primary. */
export function EventStatusControls({
  eventId,
  status,
}: {
  eventId: string;
  status: EventStatus;
}) {
  const [state, action] = useActionState(setEventStatusAction, idleState);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="eventId" value={eventId} />
      <FormFeedback state={state} />

      <div className="flex flex-wrap gap-2">
        {status !== 'CANCELLED' ? (
          <SubmitButton name="status" value="CANCELLED" variant="danger" pendingLabel="Cancelling…">
            Cancel this night
          </SubmitButton>
        ) : null}
        {status !== 'ARCHIVED' ? (
          <SubmitButton name="status" value="ARCHIVED" variant="secondary" pendingLabel="Archiving…">
            Archive
          </SubmitButton>
        ) : null}
        {status !== 'ACTIVE' ? (
          <SubmitButton name="status" value="ACTIVE" variant="teal" pendingLabel="Reopening…">
            Reopen
          </SubmitButton>
        ) : null}
      </div>
    </form>
  );
}
