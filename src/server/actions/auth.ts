'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { auth } from '@/lib/auth';
import { requireUser } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { clientIpFrom, consumeRateLimit } from '@/lib/rate-limit';
import { displayNameSchema } from '@/lib/validation';

import {
  failure,
  fieldErrorsFrom,
  firstMessage,
  runAction,
  success,
  type ActionState,
} from './shared';

const credentialsSchema = z.object({
  email: z.email('Enter a valid email address.').max(200),
  password: z.string().min(10, 'Passwords need at least 10 characters.').max(128),
});

const signUpSchema = credentialsSchema.extend({
  name: displayNameSchema,
});

/** Only allow same-origin relative paths, so `?next=` cannot be an open redirect. */
function safeNext(value: FormDataEntryValue | null): string {
  const raw = typeof value === 'string' ? value : '';
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  return '/dashboard';
}

export async function signUpAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const next = safeNext(formData.get('next'));
  let ok = false;

  const state = await runAction(async () => {
    const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      const fieldErrors = fieldErrorsFrom(parsed.error);
      return failure(firstMessage(fieldErrors), fieldErrors);
    }

    const requestHeaders = await headers();
    const limit = await consumeRateLimit({
      bucket: 'sign-up',
      key: clientIpFrom(requestHeaders),
      limit: 10,
      windowSeconds: 3600,
    });
    if (!limit.allowed) {
      return failure('Too many sign-up attempts from this network. Try again later.');
    }

    try {
      await auth.api.signUpEmail({
        body: {
          name: parsed.data.name,
          email: parsed.data.email,
          password: parsed.data.password,
        },
        headers: requestHeaders,
      });
      ok = true;
      return success();
    } catch (error) {
      const message = errorMessage(error);
      if (/exist|taken|unique/i.test(message)) {
        return failure('An account with that email already exists. Try signing in instead.', {
          email: ['An account with that email already exists.'],
        });
      }
      return failure(message || 'Could not create that account.');
    }
  });

  if (ok) redirect(next);
  return state;
}

export async function signInAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const next = safeNext(formData.get('next'));
  let ok = false;

  const state = await runAction(async () => {
    const parsed = credentialsSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      // Deliberately vague: form-level validation here would otherwise confirm
      // which half of the credentials was wrong.
      return failure('Enter your email address and password.');
    }

    const requestHeaders = await headers();
    const ip = clientIpFrom(requestHeaders);

    // Two windows: one per account, one per source address. The first stops a
    // single account being ground down, the second stops spraying.
    const perAccount = await consumeRateLimit({
      bucket: 'sign-in-account',
      key: parsed.data.email.toLowerCase(),
      limit: 8,
      windowSeconds: 900,
    });
    const perIp = await consumeRateLimit({
      bucket: 'sign-in-ip',
      key: ip,
      limit: 30,
      windowSeconds: 900,
    });
    if (!perAccount.allowed || !perIp.allowed) {
      const wait = Math.ceil(
        Math.max(perAccount.retryAfterSeconds, perIp.retryAfterSeconds) / 60,
      );
      return failure(`Too many sign-in attempts. Please try again in ${wait} minutes.`);
    }

    try {
      await auth.api.signInEmail({
        body: { email: parsed.data.email, password: parsed.data.password },
        headers: requestHeaders,
      });
      ok = true;
      return success();
    } catch {
      return failure('That email and password combination did not work.');
    }
  });

  if (ok) redirect(next);
  return state;
}

export async function signOutAction(): Promise<void> {
  await auth.api.signOut({ headers: await headers() });
  redirect('/');
}

export async function updateDisplayNameAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser('/account');

    const parsed = displayNameSchema.safeParse(formData.get('name'));
    if (!parsed.success) {
      return failure(parsed.error.issues[0]?.message ?? 'That display name will not work.', {
        name: parsed.error.issues.map((issue) => issue.message),
      });
    }

    await prisma.user.update({ where: { id: user.id }, data: { name: parsed.data } });
    revalidatePath('/account');
    revalidatePath('/dashboard');
    return success('Display name updated.');
  });
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return '';
}
