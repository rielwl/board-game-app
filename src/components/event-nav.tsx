'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cx } from './ui';

/**
 * Tab strip for the event screens. Uses `aria-current` so the active tab is
 * announced, and does not rely on the underline alone.
 */
export function EventNav({ eventId, isOrganizer }: { eventId: string; isOrganizer: boolean }) {
  const pathname = usePathname();
  const base = `/events/${eventId}`;

  const tabs = [
    { href: base, label: 'Overview' },
    { href: `${base}/offers`, label: 'Games' },
    { href: `${base}/preferences`, label: 'Preferences' },
    { href: `${base}/recommendations`, label: 'Recommendations' },
    { href: `${base}/tonight`, label: 'Tonight' },
    ...(isOrganizer ? [{ href: `${base}/invite`, label: 'Invite' }] : []),
  ];

  return (
    <nav aria-label="Event sections" className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 border-b border-[var(--color-line)]">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'inline-block border-b-2 px-3 py-2 text-sm font-semibold transition-colors',
                  active
                    ? 'border-[var(--color-coral-600)] text-[var(--color-coral-700)]'
                    : 'border-transparent text-[var(--color-ink-soft)] hover:border-[var(--color-line)] hover:text-[var(--color-ink)]',
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
