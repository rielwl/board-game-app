import type { z } from 'zod';

/**
 * The shape every server action returns.
 *
 * This module is deliberately free of `server-only` and of any server import:
 * the `useActionState` forms in `src/components` need the type and the initial
 * value, and pulling them from a server module would drag Prisma and Better
 * Auth into the client bundle. The server-side helpers live next door in
 * `shared.ts`.
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
