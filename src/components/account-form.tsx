'use client';

import { useActionState } from 'react';

import { updateDisplayNameAction } from '@/server/actions/auth';
import { idleState } from '@/server/actions/shared';

import { FormFeedback, SubmitButton } from './form';
import { Field, describedBy, inputStyles } from './ui';

export function DisplayNameForm({ defaultName }: { defaultName: string }) {
  const [state, action] = useActionState(updateDisplayNameAction, idleState);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormFeedback state={state} />
      <Field label="Display name" htmlFor="account-name" error={state.fieldErrors.name}>
        <input
          id="account-name"
          name="name"
          type="text"
          required
          minLength={2}
          maxLength={60}
          defaultValue={defaultName}
          className={inputStyles}
          aria-describedby={describedBy('account-name', false, Boolean(state.fieldErrors.name))}
        />
      </Field>
      <div>
        <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
      </div>
    </form>
  );
}
