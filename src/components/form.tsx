'use client';

import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

import type { ActionState } from '@/server/actions/shared';

import { Alert, buttonStyles, cx } from './ui';

/**
 * Submit button that reflects the pending state of its enclosing form.
 *
 * `aria-disabled` rather than `disabled` while pending, so the button keeps
 * focus and screen readers announce the change instead of losing the element.
 */
export function SubmitButton({
  children,
  pendingLabel = 'Working…',
  variant = 'primary',
  className,
  name,
  value,
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: keyof typeof buttonStyles;
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      aria-disabled={pending}
      className={cx(buttonStyles[variant], className)}
    >
      {pending ? (
        <>
          <span
            aria-hidden="true"
            className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}

/**
 * Renders an action's result. It is a live region so the outcome is announced
 * without moving focus.
 */
export function FormFeedback({ state }: { state: ActionState }) {
  if (state.status === 'idle' || !state.message) {
    return <div aria-live="polite" className="sr-only" />;
  }

  return (
    <div aria-live="polite">
      <Alert tone={state.status === 'error' ? 'error' : 'success'}>{state.message}</Alert>
    </div>
  );
}
