import 'server-only';

import type { z } from 'zod';

import { AuthorizationError } from '@/lib/authz';

/**
 * The shape every server action returns, so `useActionState` forms can render
 * errors consistently and accessibly.
 */
export type ActionState = {
  status: 'idle' | 'success' | 'error';
  message: string | null;
  fieldErrors: Record<string, string[]>;
  /** Optional payload, used by "Pick for us" to hand its draw back to the UI. */
  data?: unknown;
};

export const idleState: ActionState = { status: 'idle', message: null, fieldErrors: {} };

export const success = (message: string | null = null, data?: unknown): ActionState => ({
  status: 'success',
  message,
  fieldErrors: {},
  data,
});

export const failure = (
  message: string,
  fieldErrors: Record<string, string[]> = {},
): ActionState => ({ status: 'error', message, fieldErrors });

export function fieldErrorsFrom(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_form';
    out[key] = [...(out[key] ?? []), issue.message];
  }
  return out;
}

export function firstMessage(fieldErrors: Record<string, string[]>): string {
  for (const messages of Object.values(fieldErrors)) {
    const message = messages[0];
    if (message) return message;
  }
  return 'Please check the form and try again.';
}

/**
 * Wraps an action body so authorization failures and unexpected errors become
 * form errors rather than unhandled rejections. Next.js control-flow signals
 * (redirect, notFound) are re-thrown untouched.
 */
export async function runAction(body: () => Promise<ActionState>): Promise<ActionState> {
  try {
    return await body();
  } catch (error) {
    if (isNextControlFlow(error)) throw error;
    if (error instanceof AuthorizationError) return failure(error.message);
    console.error('[action]', error);
    return failure('Something went wrong. Please try again.');
  }
}

function isNextControlFlow(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    typeof (error as { digest?: unknown }).digest === 'string' &&
    ((error as { digest: string }).digest.startsWith('NEXT_REDIRECT') ||
      (error as { digest: string }).digest === 'NEXT_NOT_FOUND')
  );
}
