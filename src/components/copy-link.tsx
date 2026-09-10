'use client';

import { useEffect, useState } from 'react';

import { buttonStyles, cx, inputStyles } from './ui';

/**
 * A read-only field plus a copy button.
 *
 * The clipboard API is unavailable over plain HTTP on some browsers, so the
 * input stays selectable and the button reports honestly when a copy failed
 * rather than silently doing nothing.
 */
export function CopyLink({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const timer = setTimeout(() => setState('idle'), 2500);
    return () => clearTimeout(timer);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState('copied');
    } catch {
      setState('failed');
    }
  }

  const inputId = `copy-${label.replace(/\W+/g, '-').toLowerCase()}`;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-sm font-semibold">
        {label}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={inputId}
          readOnly
          value={value}
          onFocus={(event) => event.currentTarget.select()}
          className={cx(inputStyles, 'font-mono text-xs sm:text-sm')}
        />
        <button type="button" onClick={copy} className={cx(buttonStyles.secondary, 'shrink-0')}>
          {state === 'copied' ? '✓ Copied' : state === 'failed' ? 'Copy failed' : 'Copy link'}
        </button>
      </div>
      <p aria-live="polite" className="text-xs text-[var(--color-ink-soft)]">
        {state === 'copied'
          ? 'Invite link copied to your clipboard.'
          : state === 'failed'
            ? 'Your browser blocked the clipboard. Select the text above and copy it manually.'
            : ''}
      </p>
    </div>
  );
}
