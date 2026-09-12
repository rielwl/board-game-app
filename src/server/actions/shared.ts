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

/**
 * Next.js signals control flow by throwing an error carrying a `digest`:
 * `NEXT_REDIRECT;...` from `redirect()`, and `NEXT_HTTP_ERROR_FALLBACK;<status>`
 * from `notFound()`, `forbidden()` and `unauthorized()`. Catching one of these
 * turns a 404 or a redirect into a generic "something went wrong" form error,
 * so they have to be recognised and re-thrown.
 */
const CONTROL_FLOW_DIGEST_PREFIXES = ['NEXT_REDIRECT', 'NEXT_HTTP_ERROR_FALLBACK'];

function isNextControlFlow(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('digest' in error)) return false;
  const digest = (error as { digest?: unknown }).digest;
  if (typeof digest !== 'string') return false;
  return CONTROL_FLOW_DIGEST_PREFIXES.some((prefix) => digest.startsWith(prefix));
}
