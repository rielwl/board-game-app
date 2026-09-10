'use client';

import { useActionState } from 'react';
import Link from 'next/link';

import { signInAction, signUpAction } from '@/server/actions/auth';
import { idleState } from '@/server/actions/shared';

import { FormFeedback, SubmitButton } from './form';
import { Field, describedBy, inputStyles } from './ui';

export function SignInForm({ next }: { next: string }) {
  const [state, action] = useActionState(signInAction, idleState);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <FormFeedback state={state} />

      <Field label="Email address" htmlFor="email" error={state.fieldErrors.email}>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className={inputStyles}
          aria-describedby={describedBy('email', false, Boolean(state.fieldErrors.email))}
        />
      </Field>

      <Field label="Password" htmlFor="password" error={state.fieldErrors.password}>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={inputStyles}
          aria-describedby={describedBy('password', false, Boolean(state.fieldErrors.password))}
        />
      </Field>

      <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>

      <p className="text-center text-sm text-[var(--color-ink-soft)]">
        No account yet?{' '}
        <Link
          href={`/sign-up?next=${encodeURIComponent(next)}`}
          className="font-semibold underline underline-offset-2"
        >
          Create one
        </Link>
      </p>
    </form>
  );
}

export function SignUpForm({ next }: { next: string }) {
  const [state, action] = useActionState(signUpAction, idleState);

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <FormFeedback state={state} />

      <Field
        label="Display name"
        htmlFor="name"
        hint="What your friends will see next to your RSVP."
        error={state.fieldErrors.name}
      >
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          required
          minLength={2}
          className={inputStyles}
          aria-describedby={describedBy('name', true, Boolean(state.fieldErrors.name))}
        />
      </Field>

      <Field label="Email address" htmlFor="email" error={state.fieldErrors.email}>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className={inputStyles}
          aria-describedby={describedBy('email', false, Boolean(state.fieldErrors.email))}
        />
      </Field>

      <Field
        label="Password"
        htmlFor="password"
        hint="At least 10 characters."
        error={state.fieldErrors.password}
      >
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          className={inputStyles}
          aria-describedby={describedBy('password', true, Boolean(state.fieldErrors.password))}
        />
      </Field>

      <SubmitButton pendingLabel="Creating account…">Create account</SubmitButton>

      <p className="text-center text-sm text-[var(--color-ink-soft)]">
        Already have an account?{' '}
        <Link
          href={`/sign-in?next=${encodeURIComponent(next)}`}
          className="font-semibold underline underline-offset-2"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
