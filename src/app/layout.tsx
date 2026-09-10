import type { Metadata, Viewport } from 'next';
import Link from 'next/link';

import { SiteNav } from '@/components/site-nav';
import { getSessionUser } from '@/lib/authz';

import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Meeple Night',
    template: '%s · Meeple Night',
  },
  description:
    'Plan a board game night: invite your friends, collect RSVPs and preferences, and let the table pick the right game.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#fdf8f2',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();

  return (
    <html lang="en">
      <body className="paper-grain">
        <a href="#main" className="skip-link">
          Skip to main content
        </a>

        <div className="relative z-10 flex min-h-dvh flex-col">
          <SiteNav user={user} />

          <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
            {children}
          </main>

          <footer className="mt-8 border-t border-[var(--color-line)] px-4 py-6 text-center text-xs text-[var(--color-ink-soft)] sm:px-6">
            <p>
              Meeple Night — a private board game night organiser.{' '}
              <Link href="/about" className="underline underline-offset-2">
                About the data we use
              </Link>
            </p>
          </footer>
        </div>
      </body>
    </html>
  );
}
