import { expect, test } from '@playwright/test';

import { createEvent, signUp, uniqueEmail } from './helpers';

/**
 * Regression coverage for issue #1.
 *
 * The form used to pre-fill the *server's* timezone. These tests emulate a
 * browser in a zone the server is not in, which is the condition the bug
 * needed, and assert the form follows the browser instead.
 */

test.describe('new event form picks up the organiser’s timezone', () => {
  test.use({ timezoneId: 'America/New_York' });

  test('pre-fills the browser zone, not the server zone', async ({ page }) => {
    await signUp(page, 'Nina NewYork', uniqueEmail('ny'));
    await page.goto('/events/new');

    const timezone = page.getByLabel('Timezone');
    // The old behaviour showed the host's zone, or Africa/Abidjan when the host
    // was on UTC and the value matched no option.
    await expect(timezone).toHaveValue('America/New_York', { timeout: 15_000 });
    await expect(timezone).not.toHaveValue('Africa/Abidjan');

    // The suggested start is a real date, and the field says which zone it is in.
    await expect(page.getByLabel('Starts')).toHaveValue(/^\d{4}-\d{2}-\d{2}T19:30$/);
    await expect(page.getByText('Read as local time in America/New_York')).toBeVisible();
  });

  test('saves the instant the organiser actually meant', async ({ page }) => {
    await signUp(page, 'Ned Instant', uniqueEmail('instant'));
    await page.goto('/events/new');

    await expect(page.getByLabel('Timezone')).toHaveValue('America/New_York', {
      timeout: 15_000,
    });

    await page.getByLabel('Title').fill('Timezone check night');
    await page.getByLabel('Location').fill('42 Kite Street');
    await page.getByLabel('Starts').fill('2027-03-04T19:30');
    await page.getByRole('button', { name: 'Create game night' }).click();
    await page.waitForURL(
      (url) => /^\/events\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith('/new'),
      { timeout: 30_000 },
    );

    // 19:30 in New York, read back as 19:30 in New York — and labelled.
    await expect(page.getByText(/19:30/)).toBeVisible();
    await expect(page.getByText('(America/New_York)')).toBeVisible();
  });
});

test.describe('a browser reporting UTC', () => {
  test.use({ timezoneId: 'UTC' });

  test('gets UTC, which the canonical Intl zone list does not contain', async ({ page }) => {
    await signUp(page, 'Uma Utc', uniqueEmail('utc'));
    await page.goto('/events/new');

    // This is the exact case from the report: `Intl.supportedValuesOf` omits
    // UTC, so the select used to fall through to its first option.
    await expect(page.getByLabel('Timezone')).toHaveValue('UTC', { timeout: 15_000 });
    await expect(page.getByLabel('Timezone')).not.toHaveValue('Africa/Abidjan');
  });
});

test.describe('editing keeps the stored zone', () => {
  test.use({ timezoneId: 'Asia/Singapore' });

  test('does not rewrite an event created in another zone', async ({ page }) => {
    await signUp(page, 'Ed Editor', uniqueEmail('editor'));
    const eventId = await createEvent(page, { title: 'Zone keeper' });

    await page.goto(`/events/${eventId}/edit`);
    // Detection is for new events only; editing must leave the stored zone be.
    await expect(page.getByLabel('Timezone')).toHaveValue('Asia/Singapore');

    await page.getByLabel('Timezone').selectOption('UTC');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Event updated.')).toBeVisible({ timeout: 30_000 });

    // Reopen: UTC survived the round trip rather than snapping to the first option.
    await page.goto(`/events/${eventId}/edit`);
    await expect(page.getByLabel('Timezone')).toHaveValue('UTC');
  });
});
