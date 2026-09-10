import 'server-only';

import { AuthorizationError } from '@/lib/authz';

import { failure } from './state';
import type { ActionState } from './state';

/**
 * Server-side action helpers.
 *
 * The plain data half — the `ActionState` type, `idleState`, and the small
 * constructors — lives in `./state`, which client components import. This
 * module is the part that may touch server-only code.
 */
export { failure, fieldErrorsFrom, firstMessage, idleState, success } from './state';
export type { ActionState } from './state';

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
