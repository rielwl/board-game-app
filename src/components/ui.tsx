import type { ReactNode } from 'react';
import Link from 'next/link';

/**
 * Shared presentational building blocks.
 *
 * These are plain server components: no state, no client bundle. Anything
 * interactive lives in its own `'use client'` file.
 */

export function cx(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-soft)]">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-2xl font-bold text-balance sm:text-3xl">{title}</h1>
        {subtitle ? (
          <div className="mt-1 text-sm text-[var(--color-ink-soft)]">{subtitle}</div>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function Card({
  children,
  className,
  as: Component = 'section',
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'article' | 'div' | 'li';
}) {
  return (
    <Component
      className={cx(
        'rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-paper-raised)] p-4 shadow-[0_1px_0_rgba(43,33,24,0.04)] sm:p-5',
        className,
      )}
    >
      {children}
    </Component>
  );
}

export function SectionHeading({
  children,
  hint,
  id,
}: {
  children: ReactNode;
  hint?: ReactNode;
  id?: string;
}) {
  return (
    <div className="mb-3">
      <h2 id={id} className="text-lg font-bold">
        {children}
      </h2>
      {hint ? <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{hint}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Buttons and links
// ---------------------------------------------------------------------------

const buttonBase =
  'inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60';

export const buttonStyles = {
  primary: cx(buttonBase, 'bg-[var(--color-coral-600)] text-white hover:bg-[var(--color-coral-700)]'),
  secondary: cx(
    buttonBase,
    'border border-[var(--color-line)] bg-[var(--color-paper-raised)] text-[var(--color-ink)] hover:bg-[var(--color-paper-sunken)]',
  ),
  teal: cx(buttonBase, 'bg-[var(--color-teal-600)] text-white hover:bg-[var(--color-teal-700)]'),
  ghost: cx(buttonBase, 'text-[var(--color-ink)] underline underline-offset-4 hover:text-[var(--color-coral-700)]'),
  danger: cx(
    buttonBase,
    'border border-[var(--color-coral-600)] text-[var(--color-coral-700)] hover:bg-[var(--color-coral-50)]',
  ),
} as const;

export function ButtonLink({
  href,
  children,
  variant = 'primary',
  className,
}: {
  href: string;
  children: ReactNode;
  variant?: keyof typeof buttonStyles;
  className?: string;
}) {
  return (
    <Link href={href} className={cx(buttonStyles[variant], className)}>
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

export function Alert({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  children?: ReactNode;
}) {
  const tones = {
    info: 'border-[var(--color-line)] bg-[var(--color-slate-tint)] text-[var(--color-slate-deep)]',
    success: 'border-[var(--color-teal-100)] bg-[var(--color-teal-50)] text-[var(--color-teal-700)]',
    warning: 'border-[#f0dfae] bg-[var(--color-amber-50)] text-[var(--color-amber-700)]',
    error: 'border-[var(--color-coral-100)] bg-[var(--color-coral-50)] text-[var(--color-coral-700)]',
  } as const;

  // The leading glyph means the tone is never carried by colour alone.
  const glyphs = { info: 'ℹ', success: '✓', warning: '!', error: '✕' } as const;

  return (
    <div
      className={cx('rounded-xl border px-4 py-3 text-sm', tones[tone])}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <div className="flex gap-2">
        <span aria-hidden="true" className="font-bold">
          {glyphs[tone]}
        </span>
        <div className="min-w-0">
          {title ? <p className="font-semibold">{title}</p> : null}
          {children ? <div className={title ? 'mt-0.5' : undefined}>{children}</div> : null}
        </div>
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-line)] bg-[var(--color-paper-sunken)]/60 px-4 py-8 text-center">
      <p className="text-base font-semibold">{title}</p>
      {children ? (
        <div className="mx-auto mt-1 max-w-prose text-sm text-[var(--color-ink-soft)]">
          {children}
        </div>
      ) : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'coral' | 'teal' | 'amber';
  className?: string;
}) {
  const tones = {
    neutral: 'bg-[var(--color-paper-sunken)] text-[var(--color-ink-soft)]',
    coral: 'bg-[var(--color-coral-100)] text-[var(--color-coral-700)]',
    teal: 'bg-[var(--color-teal-100)] text-[var(--color-teal-700)]',
    amber: 'bg-[var(--color-amber-50)] text-[var(--color-amber-700)]',
  } as const;

  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: string[] | undefined;
  children: ReactNode;
  className?: string;
}) {
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  const errorId = error?.length ? `${htmlFor}-error` : undefined;

  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-sm font-semibold">
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="text-xs text-[var(--color-ink-soft)]">
          {hint}
        </p>
      ) : null}
      {children}
      {error?.length ? (
        <p id={errorId} className="text-xs font-semibold text-[var(--color-coral-700)]">
          <span aria-hidden="true">✕ </span>
          {error.join(' ')}
        </p>
      ) : null}
    </div>
  );
}

export const inputStyles =
  'w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-paper-raised)] px-3 py-2 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-soft)]/70';

/** Describes the ids a Field generates, for aria-describedby wiring. */
export function describedBy(id: string, hasHint: boolean, hasError: boolean): string | undefined {
  const parts = [hasHint ? `${id}-hint` : null, hasError ? `${id}-error` : null].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : undefined;
}
