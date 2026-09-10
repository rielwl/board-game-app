'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { joinEventAction } from '@/server/actions/invites';
import { idleState } from '@/server/actions/state';

import { FormFeedback, SubmitButton } from './form';

/**
 * Redeems an invite.
 *
 * Joining an event you are already in is not an error — the action reports it
 * as a success and we navigate on regardless, so a double-click or a refresh
 * behaves the way the user expects.
 */
export function JoinEventForm({ token }: { token: string }) {
  const [state, action] = useActionState(joinEventAction, idleState);
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success') {
      router.refresh();
    }
  }, [state.status, router]);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <FormFeedback state={state} />
      <div>
        <SubmitButton pendingLabel="Joining…">Join this game night</SubmitButton>
      </div>
    </form>
  );
}
