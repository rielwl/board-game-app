import { describe, expect, it } from 'vitest';

import {
  FALLBACK_TIMEZONE,
  browserTimezone,
  isValidTimezone,
  supportedTimezones,
} from '@/lib/timezones';
import { localDateTimeToUtc, suggestedStartLocal, toLocalInputValue } from '@/lib/validation';

/**
 * Regression tests for issue #1: the new-event form pre-filled the *server's*
 * timezone, and on a UTC host the resulting `defaultValue` matched no option
 * in the select, so the browser silently displayed the first one
 * (`Africa/Abidjan`) and events were created at the wrong instant.
 */

describe('supportedTimezones', () => {
  it('always offers UTC, which the canonical Intl list omits', () => {
    // The precondition that made the bug possible. If this ever changes
    // upstream the guard below is harmless, but the assertion documents why
    // the guard exists.
    const canonical = Intl.supportedValuesOf('timeZone');
    expect(canonical).not.toContain('UTC');

    expect(supportedTimezones()).toContain('UTC');
  });

  it('contains the fallback the server renders, so the select can match it', () => {
    expect(supportedTimezones()).toContain(FALLBACK_TIMEZONE);
  });

  it('folds in a requested zone that the canonical list does not carry', () => {
    const zones = supportedTimezones('UTC');
    expect(zones).toContain('UTC');
    expect(zones.filter((z) => z === 'UTC')).toHaveLength(1);
  });

  it('does not duplicate a zone that is already there', () => {
    const zones = supportedTimezones('Europe/London');
    expect(zones.filter((z) => z === 'Europe/London')).toHaveLength(1);
  });

  it('ignores a bogus requested zone rather than offering it', () => {
    const zones = supportedTimezones('Mars/Olympus');
    expect(zones).not.toContain('Mars/Olympus');
    expect(zones).toContain('UTC');
  });

  it('is sorted and free of duplicates', () => {
    const zones = supportedTimezones('UTC');
    expect(new Set(zones).size).toBe(zones.length);
    expect([...zones].sort((a, b) => a.localeCompare(b))).toEqual(zones);
  });

  it('offers every zone the picker could need', () => {
    const zones = supportedTimezones();
    for (const zone of ['Europe/London', 'America/New_York', 'Asia/Singapore', 'UTC']) {
      expect(zones).toContain(zone);
    }
  });

  it('yields only zones Intl will accept', () => {
    // A value the select offers must survive `timezoneSchema` on submit.
    for (const zone of supportedTimezones('UTC').slice(0, 40)) {
      expect(isValidTimezone(zone)).toBe(true);
    }
  });
});

describe('isValidTimezone', () => {
  it('accepts real zones and rejects everything else', () => {
    expect(isValidTimezone('UTC')).toBe(true);
    expect(isValidTimezone('Europe/London')).toBe(true);
    expect(isValidTimezone('Mars/Olympus')).toBe(false);
    expect(isValidTimezone('')).toBe(false);
    expect(isValidTimezone(null)).toBe(false);
    expect(isValidTimezone(undefined)).toBe(false);
  });
});

describe('browserTimezone', () => {
  it('returns a zone that is valid and offered by the picker', () => {
    // Under Vitest this reads the host zone, which is exactly what it reads in
    // a browser. What matters is that whatever comes back is usable.
    const zone = browserTimezone();
    expect(zone).not.toBeNull();
    expect(isValidTimezone(zone)).toBe(true);
    expect(supportedTimezones(zone)).toContain(zone);
  });
});

describe('suggestedStartLocal', () => {
  it('produces a value the datetime-local input and the schema both accept', () => {
    expect(suggestedStartLocal('Europe/London')).toMatch(/^\d{4}-\d{2}-\d{2}T19:30$/);
  });

  it('is a week ahead, measured in the target zone', () => {
    const now = new Date('2026-09-10T12:00:00.000Z');
    expect(suggestedStartLocal('Europe/London', now)).toBe('2026-09-17T19:30');
    expect(suggestedStartLocal('UTC', now)).toBe('2026-09-17T19:30');
  });

  it('uses the calendar date as seen in that zone, not the runtime zone', () => {
    // 23:30 UTC is already the next day in Auckland and still the previous one
    // in Los Angeles. Reading the clock in the wrong zone shifts the date.
    const now = new Date('2026-09-10T23:30:00.000Z');
    expect(suggestedStartLocal('Pacific/Auckland', now)).toBe('2026-09-18T19:30');
    expect(suggestedStartLocal('America/Los_Angeles', now)).toBe('2026-09-17T19:30');
  });

  it('falls back to UTC for a bogus zone instead of throwing', () => {
    const now = new Date('2026-09-10T12:00:00.000Z');
    expect(suggestedStartLocal('Mars/Olympus', now)).toBe('2026-09-17T19:30');
  });

  it('round-trips through the same conversion the form submit uses', () => {
    for (const zone of ['Europe/London', 'America/Los_Angeles', 'Pacific/Auckland', 'UTC']) {
      const local = suggestedStartLocal(zone, new Date('2026-09-10T12:00:00.000Z'));
      const instant = localDateTimeToUtc(local, zone);
      // What the organiser typed is what they get back, in their own zone.
      expect(toLocalInputValue(instant, zone)).toBe(local);
    }
  });
});
