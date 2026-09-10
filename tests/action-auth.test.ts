import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createPrismaMock } from './helpers/prisma-mock';

/**
 * Authentication server actions.
 *
 * Three properties are worth locking down here: the post-sign-in redirect
 * cannot be turned into an open redirect, a failed sign-in never reveals
 * whether the email exists, and both rate-limit windows are consulted before
 * credentials are checked.
 */

const prisma = createPrismaMock();
const signUpEmail = vi.fn();
const signInEmail = vi.fn();
const signOut = vi.fn();
const requireUser = vi.fn();
const consumeRateLimit = vi.fn();
const revalidatePath = vi.fn();
const redirect = vi.fn((to: string) => {
  const error = new Error(`NEXT_REDIRECT;replace;${to};307;`) as Error & { digest: string };
  error.digest = `NEXT_REDIRECT;replace;${to};307;`;
  throw error;
});

vi.mock('@/lib/prisma', () => ({ prisma }));
vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      signUpEmail: (args: unknown) => signUpEmail(args),
      signInEmail: (args: unknown) => signInEmail(args),
      signOut: (args: unknown) => signOut(args),
    },
  },
}));
vi.mock('@/lib/authz', async () => {
  const actual = await vi.importActual<typeof import('@/lib/authz')>('@/lib/authz');
  return { ...actual, requireUser: (to?: string) => requireUser(to) };
});
vi.mock('@/lib/rate-limit', () => ({
  consumeRateLimit: (options: unknown) => consumeRateLimit(options),
  clientIpFrom: () => '203.0.113.7',
}));
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => revalidatePath(path) }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/navigation', () => ({ redirect: (to: string) => redirect(to) }));

const { signInAction, signOutAction, signUpAction, updateDisplayNameAction } = await import(
  '@/server/actions/auth'
);
const { idleState } = await import('@/server/actions/state');

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

const credentials = { email: 'ada@example.com', password: 'correct-horse-battery' };

beforeEach(() => {
  prisma.reset();
  vi.clearAllMocks();
  consumeRateLimit.mockResolvedValue({ allowed: true, remaining: 7, retryAfterSeconds: 60 });
  requireUser.mockResolvedValue({ id: 'u1', email: credentials.email, name: 'Ada' });
});

describe('signUpAction', () => {
  it('creates the account and redirects to the dashboard by default', async () => {
    signUpEmail.mockResolvedValue({});

    await expect(
      signUpAction(idleState, form({ ...credentials, name: 'Ada' })),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(redirect).toHaveBeenCalledWith('/dashboard');
  });

  it.each([
    ['https://evil.example/phish', '/dashboard'],
    ['//evil.example/phish', '/dashboard'],
    ['/events/e1', '/events/e1'],
  ])('resolves next=%s to %s', async (next, expected) => {
    signUpEmail.mockResolvedValue({});

    await expect(
      signUpAction(idleState, form({ ...credentials, name: 'Ada', next })),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(redirect).toHaveBeenCalledWith(expected);
  });

  it('rejects a short password without creating anything', async () => {
    const state = await signUpAction(
      idleState,
      form({ email: credentials.email, password: 'short', name: 'Ada' }),
    );

    expect(state.status).toBe('error');
    expect(state.fieldErrors.password).toBeDefined();
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it('rejects a malformed email address', async () => {
    const state = await signUpAction(
      idleState,
      form({ ...credentials, email: 'not-an-email', name: 'Ada' }),
    );

    expect(state.status).toBe('error');
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it('limits sign-ups per source address', async () => {
    signUpEmail.mockResolvedValue({});

    await expect(
      signUpAction(idleState, form({ ...credentials, name: 'Ada' })),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(consumeRateLimit).toHaveBeenCalledWith({
      bucket: 'sign-up',
      key: '203.0.113.7',
      limit: 20,
      windowSeconds: 3600,
    });
  });

  it('refuses once the sign-up window is spent', async () => {
    consumeRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 600 });

    const state = await signUpAction(idleState, form({ ...credentials, name: 'Ada' }));

    expect(state).toMatchObject({
      status: 'error',
      message: 'Too many sign-up attempts from this network. Try again later.',
    });
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it('turns a duplicate-account error into a field error on the email', async () => {
    signUpEmail.mockRejectedValue(new Error('User already exists'));

    const state = await signUpAction(idleState, form({ ...credentials, name: 'Ada' }));

    expect(state.fieldErrors.email).toEqual(['An account with that email already exists.']);
    expect(redirect).not.toHaveBeenCalled();
  });

  it('reports any other sign-up failure without redirecting', async () => {
    signUpEmail.mockRejectedValue(new Error('Password is too weak'));

    const state = await signUpAction(idleState, form({ ...credentials, name: 'Ada' }));

    expect(state).toMatchObject({ status: 'error', message: 'Password is too weak' });
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe('signInAction', () => {
  it('signs in and redirects', async () => {
    signInEmail.mockResolvedValue({});

    await expect(signInAction(idleState, form(credentials))).rejects.toThrow('NEXT_REDIRECT');

    expect(signInEmail).toHaveBeenCalledWith(
      expect.objectContaining({ body: { email: credentials.email, password: credentials.password } }),
    );
    expect(redirect).toHaveBeenCalledWith('/dashboard');
  });

  it('keeps the validation message vague, so it cannot confirm an account', async () => {
    const state = await signInAction(idleState, form({ email: 'nope', password: 'x' }));

    expect(state).toMatchObject({
      status: 'error',
      message: 'Enter your email address and password.',
    });
    expect(state.fieldErrors).toEqual({});
  });

  it('gives the same message for wrong credentials as for an unknown account', async () => {
    signInEmail.mockRejectedValue(new Error('User not found'));

    const state = await signInAction(idleState, form(credentials));

    expect(state.message).toBe('That email and password combination did not work.');
  });

  it('applies a per-account window keyed by the lowercased email', async () => {
    signInEmail.mockResolvedValue({});

    await expect(
      signInAction(idleState, form({ ...credentials, email: 'Ada@Example.com' })),
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(consumeRateLimit).toHaveBeenCalledWith({
      bucket: 'sign-in-account',
      key: 'ada@example.com',
      limit: 8,
      windowSeconds: 900,
    });
  });

  it('applies a per-address window as well', async () => {
    signInEmail.mockResolvedValue({});

    await expect(signInAction(idleState, form(credentials))).rejects.toThrow('NEXT_REDIRECT');

    expect(consumeRateLimit).toHaveBeenCalledWith({
      bucket: 'sign-in-ip',
      key: '203.0.113.7',
      limit: 30,
      windowSeconds: 900,
    });
  });

  it('blocks the attempt when either window is exhausted, quoting the longer wait', async () => {
    consumeRateLimit
      .mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 300 })
      .mockResolvedValueOnce({ allowed: true, remaining: 10, retryAfterSeconds: 60 });

    const state = await signInAction(idleState, form(credentials));

    expect(state.message).toBe('Too many sign-in attempts. Please try again in 5 minutes.');
    expect(signInEmail).not.toHaveBeenCalled();
  });
});

describe('signOutAction', () => {
  it('ends the session and returns to the home page', async () => {
    signOut.mockResolvedValue({});

    await expect(signOutAction()).rejects.toThrow('NEXT_REDIRECT');

    expect(signOut).toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith('/');
  });
});

describe('updateDisplayNameAction', () => {
  it('updates the signed-in user\'s own name', async () => {
    prisma.user.update.mockResolvedValue({ id: 'u1' });

    const state = await updateDisplayNameAction(idleState, form({ name: 'Ada Lovelace' }));

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { name: 'Ada Lovelace' },
    });
    expect(state).toMatchObject({ status: 'success', message: 'Display name updated.' });
  });

  it('rejects a name that is too short', async () => {
    const state = await updateDisplayNameAction(idleState, form({ name: 'A' }));

    expect(state.status).toBe('error');
    expect(state.fieldErrors.name).toEqual(['Display names need at least 2 characters.']);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('trims the submitted name before saving it', async () => {
    prisma.user.update.mockResolvedValue({ id: 'u1' });

    await updateDisplayNameAction(idleState, form({ name: '  Ada  ' }));

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: 'Ada' } }),
    );
  });
});
