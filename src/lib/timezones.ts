/**
 * The IANA zone list offered in the event form.
 *
 * `Intl.supportedValuesOf` gives the canonical list on Node 20 and in every
 * current browser, which is the right source of truth. Two things it does not
 * do, both of which bit us:
 *
 *  - It omits `UTC` and `Etc/UTC` entirely (418 zones, starting at
 *    `Africa/Abidjan`). A `<select>` whose `defaultValue` is `UTC` therefore
 *    matches no option and silently displays the first one.
 *  - It is a *canonical* list, so a browser reporting a zone alias can name a
 *    zone the list does not carry.
 *
 * `supportedTimezones` guards against both by folding the zones we need into
 * the list rather than assuming they are there.
 */

/** Used when no zone can be detected at all. */
export const FALLBACK_TIMEZONE = 'UTC';

const FALLBACK_ZONES = [
  'UTC',
  'Europe/London',
  'Europe/Dublin',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Warsaw',
  'Europe/Athens',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Sao_Paulo',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Australia/Sydney',
  'Pacific/Auckland',
];

/** True when `Intl` will accept this string as a timezone. */
export function isValidTimezone(zone: string | null | undefined): zone is string {
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Every zone the picker offers, sorted, always including `UTC` and — when
 * given — `extra`, so a selected value can never fall outside the options.
 */
export function supportedTimezones(extra?: string | null): string[] {
  const intl = Intl as typeof Intl & {
    supportedValuesOf?: (key: string) => string[];
  };

  let zones: string[];
  try {
    const supported = intl.supportedValuesOf?.('timeZone');
    zones = supported && supported.length > 0 ? [...supported] : [...FALLBACK_ZONES];
  } catch {
    zones = [...FALLBACK_ZONES];
  }

  const required = [FALLBACK_TIMEZONE, ...(isValidTimezone(extra) ? [extra] : [])];
  for (const zone of required) {
    if (!zones.includes(zone)) zones.push(zone);
  }

  return [...new Set(zones)].sort((a, b) => a.localeCompare(b));
}

/**
 * The zone this browser reports, or null.
 *
 * Client-side only. Calling it on the server yields the *host's* zone, which
 * is what issue #1 was about, so nothing on the server path calls it.
 */
export function browserTimezone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimezone(zone) ? zone : null;
  } catch {
    return null;
  }
}
