import { cx } from './ui';

/**
 * BoardGameGeek attribution.
 *
 * BGG's XML API2 terms require a visible, linked credit wherever their data is
 * shown, so this component appears on every screen that renders catalog data.
 */
export function BggAttribution({
  className,
  providerId = 'bgg',
}: {
  className?: string;
  providerId?: string;
}) {
  if (providerId !== 'bgg') {
    return (
      <p className={cx('text-xs text-[var(--color-ink-soft)]', className)}>
        Showing the built-in offline sample catalog. BoardGameGeek lookups are switched off.
      </p>
    );
  }

  return (
    <p className={cx('text-xs text-[var(--color-ink-soft)]', className)}>
      Game data{' '}
      <a
        href="https://boardgamegeek.com"
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold underline underline-offset-2 hover:text-[var(--color-coral-700)]"
      >
        Powered by BoardGameGeek
      </a>
      . Used non-commercially under the BGG XML API terms.
    </p>
  );
}
