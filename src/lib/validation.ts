import { z } from 'zod';

/**
 * Server-side validation schemas.
 *
 * Every mutation validates its input here before it touches the database. The
 * client-side `required`/`min` attributes are a convenience; these are the
 * rules that actually hold.
 */

/** Rejects anything `Intl` will not accept as an IANA zone. */
export const timezoneSchema = z.string().min(1).refine(
  (value) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  },
  { message: 'Not a recognised IANA timezone (for example Europe/London).' },
);

const trimmed = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null));

export const eventInputSchema = z.object({
  title: trimmed(120).min(3, 'Give the night a title of at least 3 characters.'),
  description: optionalText(2000),
  /** `datetime-local` value, interpreted in the supplied timezone. */
  startsAtLocal: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/, 'Pick a date and time.'),
  timezone: timezoneSchema,
  location: trimmed(200).min(2, 'Where is it happening?'),
  attendeeNotes: optionalText(2000),
  maxAttendees: z
    .union([z.literal(''), z.coerce.number().int().min(1).max(100)])
    .optional()
    .transform((value) => (value === '' || value === undefined ? null : value)),
});

export type EventInput = z.infer<typeof eventInputSchema>;

export const recommendationSettingsSchema = z.object({
  targetPlayerCount: z
    .union([z.literal(''), z.coerce.number().int().min(1).max(30)])
    .optional()
    .transform((value) => (value === '' || value === undefined ? null : value)),
  maxDurationMinutes: z
    .union([z.literal(''), z.coerce.number().int().min(5).max(1440)])
    .optional()
    .transform((value) => (value === '' || value === undefined ? null : value)),
  complexityTarget: z
    .union([z.literal(''), z.coerce.number().min(1).max(5)])
    .optional()
    .transform((value) => (value === '' || value === undefined ? null : value)),
});

export const inviteInputSchema = z.object({
  expiresInDays: z
    .union([z.literal(''), z.coerce.number().int().min(1).max(365)])
    .optional()
    .transform((value) => (value === '' || value === undefined ? null : value)),
  maxUses: z
    .union([z.literal(''), z.coerce.number().int().min(1).max(500)])
    .optional()
    .transform((value) => (value === '' || value === undefined ? null : value)),
});

export const rsvpSchema = z.object({
  eventId: z.string().min(1),
  rsvp: z.enum(['YES', 'MAYBE', 'NO']),
  rsvpNote: optionalText(500),
});

export const userGameSchema = z.object({
  userGameId: z.string().min(1),
  available: z.coerce.boolean(),
  familiarity: z.enum(['NEVER_PLAYED', 'PLAYED', 'CAN_TEACH']),
  notes: optionalText(500),
});

export const manualGameSchema = z.object({
  name: trimmed(160).min(2, 'What is the game called?'),
  minPlayers: z.coerce.number().int().min(1).max(30),
  maxPlayers: z.coerce.number().int().min(1).max(99),
  playingTime: z
    .union([z.literal(''), z.coerce.number().int().min(1).max(1440)])
    .optional()
    .transform((value) => (value === '' || value === undefined ? null : value)),
  averageWeight: z
    .union([z.literal(''), z.coerce.number().min(1).max(5)])
    .optional()
    .transform((value) => (value === '' || value === undefined ? null : value)),
  yearPublished: z
    .union([z.literal(''), z.coerce.number().int().min(1900).max(2100)])
    .optional()
    .transform((value) => (value === '' || value === undefined ? null : value)),
  notes: optionalText(500),
}).refine((value) => value.maxPlayers >= value.minPlayers, {
  message: 'Maximum players cannot be lower than minimum players.',
  path: ['maxPlayers'],
});

export const preferencesSchema = z
  .object({
    eventId: z.string().min(1),
    minComplexity: z
      .union([z.literal(''), z.coerce.number().min(1).max(5)])
      .optional()
      .transform((value) => (value === '' || value === undefined ? null : value)),
    maxComplexity: z
      .union([z.literal(''), z.coerce.number().min(1).max(5)])
      .optional()
      .transform((value) => (value === '' || value === undefined ? null : value)),
    maxPlayTime: z
      .union([z.literal(''), z.coerce.number().int().min(5).max(1440)])
      .optional()
      .transform((value) => (value === '' || value === undefined ? null : value)),
    noveltyPreference: z.enum(['FAMILIAR', 'NEW', 'EITHER']).default('EITHER'),
    note: optionalText(500),
  })
  .refine(
    (value) =>
      value.minComplexity == null ||
      value.maxComplexity == null ||
      value.minComplexity <= value.maxComplexity,
    {
      message: 'Minimum complexity cannot be above the maximum.',
      path: ['maxComplexity'],
    },
  );

export const selectionSchema = z
  .object({
    eventId: z.string().min(1),
    primaryGameId: z.string().min(1, 'Choose a primary game.'),
    backup1GameId: z.string().optional().transform((v) => (v && v.length > 0 ? v : null)),
    backup2GameId: z.string().optional().transform((v) => (v && v.length > 0 ? v : null)),
    notes: optionalText(500),
  })
  .refine(
    (value) =>
      new Set(
        [value.primaryGameId, value.backup1GameId, value.backup2GameId].filter(Boolean),
      ).size ===
      [value.primaryGameId, value.backup1GameId, value.backup2GameId].filter(Boolean).length,
    { message: 'Pick three different games.', path: ['backup1GameId'] },
  );

export const bggUsernameSchema = z
  .string()
  .trim()
  .min(1, 'Enter a BoardGameGeek username.')
  .max(64)
  // BGG usernames are alphanumeric plus a few separators. Validating here keeps
  // anything odd out of the outbound query string.
  .regex(/^[A-Za-z0-9._-]+$/, 'That does not look like a BoardGameGeek username.');

export const displayNameSchema = z
  .string()
  .trim()
  .min(2, 'Display names need at least 2 characters.')
  .max(60);

/**
 * Converts a `datetime-local` string plus an IANA zone into an absolute
 * instant, without pulling in a date library.
 *
 * The trick: format a guessed UTC instant in the target zone, measure how far
 * off it is, and correct. One correction pass is enough for every real zone,
 * and a second pass settles the DST boundary cases.
 */
export function localDateTimeToUtc(localValue: string, timeZone: string): Date {
  const [datePart = '', timePart = '00:00'] = localValue.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute, second] = timePart.split(':').map(Number);

  const wanted = Date.UTC(
    year ?? 1970,
    (month ?? 1) - 1,
    day ?? 1,
    hour ?? 0,
    minute ?? 0,
    second ?? 0,
  );

  let guess = wanted;
  for (let i = 0; i < 2; i += 1) {
    const offset = zoneOffsetMs(new Date(guess), timeZone);
    const next = wanted - offset;
    if (next === guess) break;
    guess = next;
  }
  return new Date(guess);
}

/** How far ahead of UTC `timeZone` is at `instant`, in milliseconds. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(instant).map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - instant.getTime();
}

/** Renders an instant as wall-clock time in the event's own timezone. */
export function formatInZone(
  instant: Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
    // Always name the zone. A time shown without one is ambiguous to anybody
    // reading it from somewhere else, which is half of what issue #1 was about.
    timeZoneName: 'short',
  },
): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { ...options, timeZone }).format(instant);
  } catch {
    return new Intl.DateTimeFormat('en-GB', options).format(instant);
  }
}

/** `2026-09-12T19:30` for a `datetime-local` input, in the event's zone. */
export function toLocalInputValue(instant: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/**
 * The date field's starting suggestion: 19:30, a week from today, expressed as
 * a `datetime-local` string in `timeZone`.
 *
 * The calendar date is the one a week out *as seen in that zone*, so an
 * organiser near the date line does not get yesterday. Doing this with
 * `Date.setHours` would silently use the runtime's zone instead, which is the
 * bug this function exists to avoid.
 */
export function suggestedStartLocal(timeZone: string, now: Date = new Date()): string {
  const inAWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const format = (zone: string) =>
    Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
        .formatToParts(inAWeek)
        .map((part) => [part.type, part.value]),
    );

  let parts: Record<string, string>;
  try {
    parts = format(timeZone);
  } catch {
    parts = format('UTC');
  }

  return `${parts.year}-${parts.month}-${parts.day}T19:30`;
}
