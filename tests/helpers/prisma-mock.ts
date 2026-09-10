import type { PrismaClient } from '@prisma/client';
import { vi, type Mock } from 'vitest';

/**
 * A stand-in for the Prisma client.
 *
 * Server actions and read models are mostly a sequence of Prisma calls glued
 * together by decisions, and it is the decisions that are worth testing. This
 * mock makes every `prisma.<model>.<method>()` a `vi.fn()` created on first
 * access, so a test only has to arrange the handful of calls it cares about
 * and can then assert on the exact `where` clause a call was made with —
 * which is how the "scoped to the caller" guarantees are pinned down.
 */

/** Delegate methods a test may stub. Anything else throws, loudly. */
const DELEGATE_METHODS = [
  'aggregate',
  'count',
  'create',
  'createMany',
  'delete',
  'deleteMany',
  'findFirst',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'groupBy',
  'update',
  'updateMany',
  'upsert',
] as const;

type DelegateMethod = (typeof DELEGATE_METHODS)[number];
export type MockDelegate = Record<DelegateMethod, Mock>;

/**
 * The model properties of the real client (`game`, `eventMember`, ...).
 * Deriving them keeps a typo in a test an error rather than a silent new
 * delegate, and, being a union rather than an index signature, it survives
 * `noUncheckedIndexedAccess` without every access needing a `!`.
 */
type ModelName = {
  [K in keyof PrismaClient]: PrismaClient[K] extends { findMany: unknown } ? K : never;
}[keyof PrismaClient];

export type PrismaMock = { [K in ModelName]: MockDelegate } & {
  $transaction: Mock;
  /** Clears call history and implementations on every delegate created so far. */
  reset(): void;
};

function makeDelegate(model: string): MockDelegate {
  const delegate = {} as MockDelegate;
  for (const method of DELEGATE_METHODS) {
    // An unstubbed call is a test bug, not a silent `undefined`: without this
    // a forgotten `mockResolvedValue` shows up as an unrelated TypeError much
    // further down the call stack.
    delegate[method] = vi.fn(() => {
      throw new Error(`prisma.${model}.${method}() was called but not stubbed in this test`);
    });
  }
  return delegate;
}

export function createPrismaMock(): PrismaMock {
  const delegates = new Map<string, MockDelegate>();

  // Interactive `$transaction(fn)` runs the callback against the same mock, so
  // a test stubs `prisma.x.y` once regardless of which side of a transaction
  // the call happens on. Array form resolves the array, as Prisma does.
  const transaction = vi.fn(async (arg: unknown) => {
    if (typeof arg === 'function') return (arg as (tx: unknown) => unknown)(proxy);
    return Promise.all(arg as Promise<unknown>[]);
  });

  const reset = () => {
    for (const delegate of delegates.values()) {
      for (const method of DELEGATE_METHODS) delegate[method].mockReset();
    }
    delegates.clear();
    transaction.mockClear();
  };

  const proxy = new Proxy({} as PrismaMock, {
    get(_target, property: string | symbol) {
      if (property === '$transaction') return transaction;
      if (property === 'reset') return reset;
      if (typeof property !== 'string') return undefined;
      // `await prisma` and similar promise sniffing must not create a delegate.
      if (property === 'then') return undefined;

      let delegate = delegates.get(property);
      if (!delegate) {
        delegate = makeDelegate(property);
        delegates.set(property, delegate);
      }
      return delegate;
    },
  });

  return proxy;
}
