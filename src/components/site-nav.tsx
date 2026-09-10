import Link from 'next/link';

import { signOutAction } from '@/server/actions/auth';

import { buttonStyles, cx } from './ui';

/**
 * Top navigation. Mobile-first: the links wrap onto their own row on small
 * screens rather than collapsing into a menu that needs JavaScript.
 */
export function SiteNav({ user }: { user: { id: string; name: string } | null }) {
  return (
    <header className="border-b border-[var(--color-line)] bg-[var(--color-paper-raised)]/80 backdrop-blur">
      <nav
        aria-label="Main"
        className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6"
      >
        <Link href={user ? '/dashboard' : '/'} className="flex items-center gap-2 font-bold">
          <span aria-hidden="true" className="text-xl">
            🎲
          </span>
          <span className="text-lg">Meeple Night</span>
        </Link>

        {user ? (
          <>
            <ul className="order-3 flex w-full gap-4 text-sm font-semibold sm:order-none sm:ml-4 sm:w-auto">
              <li>
                <Link href="/dashboard" className="hover:text-[var(--color-coral-700)]">
                  Events
                </Link>
              </li>
              <li>
                <Link href="/library" className="hover:text-[var(--color-coral-700)]">
                  My games
                </Link>
              </li>
              <li>
                <Link href="/account" className="hover:text-[var(--color-coral-700)]">
                  Account
                </Link>
              </li>
            </ul>

            <div className="ml-auto flex items-center gap-3">
              <span className="hidden text-sm text-[var(--color-ink-soft)] sm:inline">
                {user.name}
              </span>
              <form action={signOutAction}>
                <button type="submit" className={cx(buttonStyles.secondary, 'px-3 py-1.5')}>
                  Sign out
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="ml-auto flex items-center gap-2">
            <Link href="/sign-in" className={cx(buttonStyles.ghost, 'px-3 py-1.5')}>
              Sign in
            </Link>
            <Link href="/sign-up" className={cx(buttonStyles.primary, 'px-3 py-1.5')}>
              Create account
            </Link>
          </div>
        )}
      </nav>
    </header>
  );
}
