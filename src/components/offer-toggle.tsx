'use client';

import { useActionState } from 'react';

import { toggleOfferAction, toggleRequestAction } from '@/server/actions/event-games';
import { idleState } from '@/server/actions/state';

import { FormFeedback, SubmitButton } from './form';

/** "I'll bring this" toggle for one game at one event. */
export function OfferToggle({
  eventId,
  gameId,
  gameName,
  offering,
  disabled,
  disabledReason,
}: {
  eventId: string;
  gameId: string;
  gameName: string;
  offering: boolean;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [state, action] = useActionState(toggleOfferAction, idleState);

  if (disabled) {
    return (
      <p className="text-xs font-semibold text-[var(--color-ink-soft)]">
        {disabledReason ?? 'Unavailable'}
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col items-start gap-2">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="gameId" value={gameId} />
      <input type="hidden" name="offering" value={offering ? 'false' : 'true'} />

      <SubmitButton
        variant={offering ? 'secondary' : 'teal'}
        pendingLabel={offering ? 'Removing…' : 'Adding…'}
      >
        <span aria-hidden="true">{offering ? '✓' : '+'}</span>
        {offering ? 'Bringing this' : "I'll bring this"}
        <span className="sr-only"> — {gameName}</span>
      </SubmitButton>

      <FormFeedback state={state} />
    </form>
  );
}

/** "I would like to play this" toggle. Independent of who brings it. */
export function RequestToggle({
  eventId,
  gameId,
  gameName,
  requesting,
}: {
  eventId: string;
  gameId: string;
  gameName: string;
  requesting: boolean;
}) {
  const [state, action] = useActionState(toggleRequestAction, idleState);

  return (
    <form action={action} className="flex flex-col items-start gap-2">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="gameId" value={gameId} />
      <input type="hidden" name="requesting" value={requesting ? 'false' : 'true'} />

      <SubmitButton variant={requesting ? 'secondary' : 'ghost'} pendingLabel="Saving…">
        <span aria-hidden="true">{requesting ? '★' : '☆'}</span>
        {requesting ? 'Requested' : 'Request this'}
        <span className="sr-only"> — {gameName}</span>
      </SubmitButton>

      <FormFeedback state={state} />
    </form>
  );
}
