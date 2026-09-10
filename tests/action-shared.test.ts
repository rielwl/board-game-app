import { describe, expect, it, vi } from 'vitest';

import { AuthorizationError } from '@/lib/authz';

/**
 * `runAction`, the error boundary every server action is wrapped in.
 *
 * Two things matter here. Expected failures have to come back as form state so
 * the UI can render them, and Next.js control-flow signals — the errors that
 * `redirect()` and `notFound()` throw — have to pass straight through, because
 * catching one turns a redirect into a silent no-op.
 */

vi.mock('next/navigation', () => ({ redirect: () => undefined }));
// `authz` reaches Better Auth, which validates the environment on import.
// Only the error class is needed here.
vi.mock('@/lib/auth', () => ({ auth: {} }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));

const { failure, fieldErrorsFrom, firstMessage, idleState, runAction, success } = await import(
  '@/server/actions/shared'
);

/** Mirrors how Next.js tags its control-flow errors. */
function controlFlowError(digest: string): Error {
  const error = new Error(digest);
  (error as Error & { digest: string }).digest = digest;
  return error;
}

describe('state constructors', () => {
  it('starts idle with no message and no field errors', () => {
    expect(idleState).toEqual({ status: 'idle', message: null, fieldErrors: {} });
  });

  it('builds a success state, optionally carrying a payload', () => {
    expect(success()).toEqual({ status: 'success', message: null, fieldErrors: {}, data: undefined });
    expect(success('Saved.', { id: 'g1' })).toMatchObject({
      status: 'success',
      message: 'Saved.',
      data: { id: 'g1' },
    });
  });

  it('builds a failure state with field errors', () => {
    expect(failure('Nope.', { title: ['Too short.'] })).toEqual({
      status: 'error',
      message: 'Nope.',
      fieldErrors: { title: ['Too short.'] },
    });
  });
});

describe('fieldErrorsFrom', () => {
  it('groups issues by their dotted path', () => {
    const error = {
      issues: [
        { path: ['title'], message: 'Too short.' },
        { path: ['title'], message: 'Also rude.' },
        { path: ['nested', 'field'], message: 'Bad.' },
      ],
    };

    expect(fieldErrorsFrom(error as never)).toEqual({
      title: ['Too short.', 'Also rude.'],
      'nested.field': ['Bad.'],
    });
  });

  it('files a path-less issue under _form', () => {
    const error = { issues: [{ path: [], message: 'Whole form is wrong.' }] };

    expect(fieldErrorsFrom(error as never)).toEqual({ _form: ['Whole form is wrong.'] });
  });
});

describe('firstMessage', () => {
  it('returns the first message it finds', () => {
    expect(firstMessage({ title: ['Too short.'], location: ['Missing.'] })).toBe('Too short.');
  });

  it('falls back to a generic message when there is nothing to show', () => {
    expect(firstMessage({})).toBe('Please check the form and try again.');
    expect(firstMessage({ title: [] })).toBe('Please check the form and try again.');
  });
});

describe('runAction', () => {
  it('passes a successful result through untouched', async () => {
    await expect(runAction(async () => success('Done.'))).resolves.toEqual(success('Done.'));
  });

  it('turns an AuthorizationError into a form error, keeping its message', async () => {
    const state = await runAction(async () => {
      throw new AuthorizationError('Only the organizer can do that.');
    });

    expect(state).toEqual(failure('Only the organizer can do that.'));
  });

  it('hides an unexpected error behind a generic message', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const state = await runAction(async () => {
      throw new Error('connect ECONNREFUSED 10.0.0.5:5432');
    });

    expect(state).toEqual(failure('Something went wrong. Please try again.'));
    // Swallowed for the user, but not for the operator.
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('re-throws the error redirect() raises', async () => {
    const signal = controlFlowError('NEXT_REDIRECT;replace;/dashboard;307;');

    await expect(runAction(async () => { throw signal; })).rejects.toBe(signal);
  });

  it('re-throws the error notFound() raises', async () => {
    // Next.js reports notFound() as an HTTP access fallback, not as a bespoke
    // NEXT_NOT_FOUND digest. Catching it would turn a 404 into a form error.
    const signal = controlFlowError('NEXT_HTTP_ERROR_FALLBACK;404');

    await expect(runAction(async () => { throw signal; })).rejects.toBe(signal);
  });

  it('re-throws the errors forbidden() and unauthorized() raise', async () => {
    for (const digest of ['NEXT_HTTP_ERROR_FALLBACK;403', 'NEXT_HTTP_ERROR_FALLBACK;401']) {
      const signal = controlFlowError(digest);
      await expect(runAction(async () => { throw signal; })).rejects.toBe(signal);
    }
  });

  it('does not mistake an ordinary error carrying a digest field for control flow', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const notControlFlow = controlFlowError('SOME_OTHER_DIGEST');

    const state = await runAction(async () => { throw notControlFlow; });

    expect(state).toEqual(failure('Something went wrong. Please try again.'));
    error.mockRestore();
  });
});
