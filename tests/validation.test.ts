import { describe, expect, it } from 'vitest';

import {
  eventInputSchema,
  formatInZone,
  localDateTimeToUtc,
  manualGameSchema,
  preferencesSchema,
  selectionSchema,
  timezoneSchema,
  toLocalInputValue,
} from '@/lib/validation';

describe('timezoneSchema', () => {
  it('accepts real IANA zones', () => {
    for (const zone of ['UTC', 'Europe/London', 'America/New_York', 'Asia/Kolkata']) {
      expect(timezoneSchema.safeParse(zone).success).toBe(true);
    }
  });

  it('rejects nonsense', () => {
    for (const zone of ['', 'Mars/Olympus', 'GMT+25', 'Europe/Nowhere']) {
      expect(timezoneSchema.safeParse(zone).success).toBe(false);
    }
  });
});

describe('localDateTimeToUtc', () => {
  it('interprets a wall-clock time in the given zone', () => {
    // 19:30 on a British Summer Time date is 18:30 UTC.
    expect(localDateTimeToUtc('2026-07-15T19:30', 'Europe/London').toISOString()).toBe(
      '2026-07-15T18:30:00.000Z',
    );
    // The same wall clock in winter is 19:30 UTC.
    expect(localDateTimeToUtc('2026-01-15T19:30', 'Europe/London').toISOString()).toBe(
      '2026-01-15T19:30:00.000Z',
    );
  });

  it('handles a zone behind UTC', () => {
    expect(localDateTimeToUtc('2026-07-15T19:30', 'America/New_York').toISOString()).toBe(
      '2026-07-15T23:30:00.000Z',
    );
  });

  it('handles a half-hour offset zone', () => {
    expect(localDateTimeToUtc('2026-07-15T19:30', 'Asia/Kolkata').toISOString()).toBe(
      '2026-07-15T14:00:00.000Z',
    );
  });

  it('treats UTC input as UTC', () => {
    expect(localDateTimeToUtc('2026-07-15T19:30', 'UTC').toISOString()).toBe(
      '2026-07-15T19:30:00.000Z',
    );
  });

  it('round-trips through toLocalInputValue', () => {
    for (const zone of ['Europe/London', 'America/Los_Angeles', 'Australia/Sydney', 'UTC']) {
      const local = '2026-03-21T20:15';
      const instant = localDateTimeToUtc(local, zone);
      expect(toLocalInputValue(instant, zone)).toBe(local);
    }
  });
});

describe('formatInZone', () => {
  it('renders the event zone, not the server zone', () => {
    const instant = new Date('2026-07-15T18:30:00.000Z');
    expect(formatInZone(instant, 'Europe/London')).toContain('19:30');
    expect(formatInZone(instant, 'America/New_York')).toContain('14:30');
  });

  it('falls back rather than throwing on a bad zone', () => {
    const instant = new Date('2026-07-15T18:30:00.000Z');
    expect(() => formatInZone(instant, 'Mars/Olympus')).not.toThrow();
  });
});

describe('eventInputSchema', () => {
  const valid = {
    title: 'Thursday board games',
    startsAtLocal: '2026-09-17T19:30',
    timezone: 'Europe/London',
    location: '42 Kite Street',
  };

  it('accepts the minimum viable event', () => {
    const result = eventInputSchema.safeParse(valid);
    expect(result.success).toBe(true);
    // Blank optionals normalise to null, not empty strings.
    expect(result.data?.description).toBeNull();
    expect(result.data?.maxAttendees).toBeNull();
  });

  it('trims whitespace and rejects a title that is only spaces', () => {
    expect(eventInputSchema.safeParse({ ...valid, title: '   ' }).success).toBe(false);
    expect(eventInputSchema.safeParse({ ...valid, title: '  Games  ' }).data?.title).toBe('Games');
  });

  it('requires a location', () => {
    expect(eventInputSchema.safeParse({ ...valid, location: '' }).success).toBe(false);
  });

  it('rejects a malformed datetime', () => {
    expect(eventInputSchema.safeParse({ ...valid, startsAtLocal: '17/09/2026' }).success).toBe(
      false,
    );
    expect(eventInputSchema.safeParse({ ...valid, startsAtLocal: '' }).success).toBe(false);
  });

  it('coerces maxAttendees and rejects zero or negative', () => {
    expect(eventInputSchema.safeParse({ ...valid, maxAttendees: '6' }).data?.maxAttendees).toBe(6);
    expect(eventInputSchema.safeParse({ ...valid, maxAttendees: '0' }).success).toBe(false);
    expect(eventInputSchema.safeParse({ ...valid, maxAttendees: '-3' }).success).toBe(false);
  });

  it('rejects an over-long title rather than silently truncating', () => {
    expect(eventInputSchema.safeParse({ ...valid, title: 'x'.repeat(200) }).success).toBe(false);
  });
});

describe('manualGameSchema', () => {
  const valid = { name: 'Attic Find', minPlayers: '3', maxPlayers: '5' };

  it('accepts a minimal manual game', () => {
    const result = manualGameSchema.safeParse(valid);
    expect(result.success).toBe(true);
    expect(result.data?.minPlayers).toBe(3);
    expect(result.data?.playingTime).toBeNull();
  });

  it('rejects a max below the min', () => {
    const result = manualGameSchema.safeParse({ ...valid, minPlayers: '5', maxPlayers: '2' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['maxPlayers']);
  });

  it('keeps complexity inside the 1-5 scale', () => {
    expect(manualGameSchema.safeParse({ ...valid, averageWeight: '3.5' }).success).toBe(true);
    expect(manualGameSchema.safeParse({ ...valid, averageWeight: '9' }).success).toBe(false);
    expect(manualGameSchema.safeParse({ ...valid, averageWeight: '0' }).success).toBe(false);
  });
});

describe('preferencesSchema', () => {
  it('rejects a minimum complexity above the maximum', () => {
    const result = preferencesSchema.safeParse({
      eventId: 'e1',
      minComplexity: '4',
      maxComplexity: '2',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['maxComplexity']);
  });

  it('allows one bound without the other', () => {
    expect(preferencesSchema.safeParse({ eventId: 'e1', maxComplexity: '3' }).success).toBe(true);
    expect(preferencesSchema.safeParse({ eventId: 'e1', minComplexity: '2' }).success).toBe(true);
  });

  it('defaults novelty to EITHER', () => {
    const result = preferencesSchema.safeParse({ eventId: 'e1' });
    expect(result.data?.noveltyPreference).toBe('EITHER');
  });

  it('rejects an unknown novelty value', () => {
    expect(
      preferencesSchema.safeParse({ eventId: 'e1', noveltyPreference: 'WHATEVER' }).success,
    ).toBe(false);
  });
});

describe('selectionSchema', () => {
  it('accepts a primary with no backups', () => {
    expect(selectionSchema.safeParse({ eventId: 'e1', primaryGameId: 'g1' }).success).toBe(true);
  });

  it('rejects the same game appearing twice', () => {
    expect(
      selectionSchema.safeParse({ eventId: 'e1', primaryGameId: 'g1', backup1GameId: 'g1' })
        .success,
    ).toBe(false);
    expect(
      selectionSchema.safeParse({
        eventId: 'e1',
        primaryGameId: 'g1',
        backup1GameId: 'g2',
        backup2GameId: 'g2',
      }).success,
    ).toBe(false);
  });

  it('accepts three distinct games', () => {
    expect(
      selectionSchema.safeParse({
        eventId: 'e1',
        primaryGameId: 'g1',
        backup1GameId: 'g2',
        backup2GameId: 'g3',
      }).success,
    ).toBe(true);
  });

  it('requires a primary game', () => {
    expect(selectionSchema.safeParse({ eventId: 'e1', primaryGameId: '' }).success).toBe(false);
  });
});
