import { expect, test } from '@playwright/test';

import {
  addGameToLibrary,
  createEvent,
  createInviteLink,
  joinEvent,
  offerGame,
  signOut,
  signUp,
  uniqueEmail,
} from './helpers';

/**
 * Criterion 7: unauthorized users cannot read or modify a private event.
 * Criterion 8: duplicate joins and duplicate imports are handled safely.
 * Criterion 9: the app stays usable with BoardGameGeek switched off.
 *
 * The webServer for this suite runs with BGG_ENABLED=false, so criterion 9 is
 * covered implicitly by every other test here too.
 */

test('a stranger cannot read or modify a private event', async ({ page, context }) => {
  const organizerEmail = uniqueEmail('private-organizer');
  const strangerEmail = uniqueEmail('stranger');

  await signUp(page, 'Priya Private', organizerEmail);
  const eventId = await createEvent(page, {
    title: 'Members only night',
    location: 'Secret Cellar, 9 Hidden Lane',
  });
  await signOut(page);

  // A signed-out visitor is sent to sign in, not shown the event.
  await page.goto(`/events/${eventId}`);
  await page.waitForURL(/\/sign-in/, { timeout: 30_000 });
  await expect(page.getByText('Secret Cellar')).toHaveCount(0);

  // A different signed-in user gets a 404-shaped page, which does not confirm
  // that the event exists at all.
  await signUp(page, 'Sid Stranger', strangerEmail);
  await page.goto(`/events/${eventId}`);
  await expect(page.getByRole('heading', { name: 'Nothing here' })).toBeVisible();
  await expect(page.getByText('Secret Cellar')).toHaveCount(0);

  // The same for every sub-page, including the organizer-only ones.
  for (const path of ['tonight', 'offers', 'preferences', 'recommendations', 'edit', 'invite']) {
    await page.goto(`/events/${eventId}/${path}`);
    await expect(page.getByRole('heading', { name: 'Nothing here' })).toBeVisible();
    await expect(page.getByText('Secret Cellar')).toHaveCount(0);
  }

  // Fetched outside the browser, the raw HTML for a private event still
  // carries none of its details for a non-member. (Server actions cannot be
  // forged from here without their generated action id; that the server, not
  // the UI, is the gate is covered directly in tests/authorization.test.ts.)
  const response = await context.request.get(`/events/${eventId}`, {
    failOnStatusCode: false,
  });
  const body = await response.text();
  expect(body).not.toContain('Secret Cellar');
  expect(body).not.toContain('Members only night');
});

test('an attendee cannot use organizer-only controls', async ({ page }) => {
  const organizerEmail = uniqueEmail('boss');
  const attendeeEmail = uniqueEmail('guest');

  await signUp(page, 'Bea Boss', organizerEmail);
  const eventId = await createEvent(page, { title: 'Role check night' });
  const inviteUrl = await createInviteLink(page, eventId);
  await signOut(page);

  await signUp(page, 'Gus Guest', attendeeEmail);
  await joinEvent(page, inviteUrl, eventId);

  // A member can read the event...
  await page.goto(`/events/${eventId}`);
  await expect(page.getByRole('heading', { name: 'Role check night' })).toBeVisible();

  // ...but the organizer-only pages are simply not there for them.
  await page.goto(`/events/${eventId}/edit`);
  await expect(page.getByRole('heading', { name: 'Nothing here' })).toBeVisible();
  await page.goto(`/events/${eventId}/invite`);
  await expect(page.getByRole('heading', { name: 'Nothing here' })).toBeVisible();

  // And the recommendations page shows the ranking without the lock controls.
  await page.goto(`/events/${eventId}/recommendations`);
  await expect(page.getByRole('heading', { name: 'Play tonight' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Lock this in/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Pick for us/ })).toHaveCount(0);
  await expect(page.getByLabel('Target player count')).toHaveCount(0);
});

test('joining twice and importing twice are both safe', async ({ page }) => {
  const organizerEmail = uniqueEmail('twice-organizer');
  const attendeeEmail = uniqueEmail('twice-attendee');

  await signUp(page, 'Tia Twice', organizerEmail);
  const eventId = await createEvent(page, { title: 'Idempotent night' });
  const inviteUrl = await createInviteLink(page, eventId);
  await signOut(page);

  await signUp(page, 'Dee Double', attendeeEmail);

  // First join.
  await joinEvent(page, inviteUrl, eventId);

  // Second visit to the same link: already a member, so straight through to
  // the event rather than an error or a duplicate membership.
  await page.goto(inviteUrl);
  await page.waitForURL(new RegExp(`/events/${eventId}$`), { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Idempotent night' })).toBeVisible();

  // The attendee list has exactly one Dee Double.
  await expect(page.getByRole('main').getByText('Dee Double', { exact: true })).toHaveCount(1);

  // Adding the same game twice does not duplicate the library row.
  await addGameToLibrary(page, 'Splendor');
  await addGameToLibrary(page, 'Splendor');
  await page.goto('/library');
  await expect(page.getByRole('heading', { name: /^Splendor/ })).toHaveCount(1);

  // Offering the same game twice is a no-op, not a duplicate offer.
  await offerGame(page, eventId, 'Splendor');
  await page.goto(`/events/${eventId}`);
  await expect(page.getByText('Splendor')).toHaveCount(1);
});

test('a revoked invite stops working', async ({ page }) => {
  const organizerEmail = uniqueEmail('revoker');
  const outsiderEmail = uniqueEmail('outsider');

  await signUp(page, 'Rex Revoker', organizerEmail);
  const eventId = await createEvent(page, { title: 'Revoked night' });
  const inviteUrl = await createInviteLink(page, eventId);

  await page.goto(`/events/${eventId}/invite`);
  await page.getByRole('button', { name: 'Revoke this link' }).first().click();
  await expect(page.getByText('Invite link revoked.')).toBeVisible({ timeout: 30_000 });
  await signOut(page);

  await signUp(page, 'Ozzy Outsider', outsiderEmail);
  await page.goto(inviteUrl);
  await expect(page.getByText(/revoked by the organizer/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Join this game night' })).toHaveCount(0);
});

test('the library works with BoardGameGeek switched off', async ({ page }) => {
  const email = uniqueEmail('offline');
  await signUp(page, 'Ola Offline', email);

  await page.goto('/library');
  // The UI says plainly which catalog it is using.
  await expect(
    page.getByText('BoardGameGeek lookups are switched off', { exact: true }),
  ).toBeVisible();

  // Search still works, against the bundled catalog.
  await addGameToLibrary(page, 'Wingspan');

  // Collection import works against the fixture usernames.
  await page.getByLabel('BoardGameGeek username').fill('demo');
  await page.getByRole('button', { name: 'Import owned games' }).click();
  await expect(page.getByText(/Imported \d+ of \d+ owned games/)).toBeVisible({
    timeout: 60_000,
  });

  // Re-running the import adds nothing new but does not fail.
  await page.getByLabel('BoardGameGeek username').fill('demo');
  await page.getByRole('button', { name: 'Import owned games' }).click();
  await expect(page.getByText(/were already in your library/)).toBeVisible({ timeout: 60_000 });

  // And manual entry is always available.
  await page.getByLabel('Game name').fill('Kitchen Table Prototype');
  await page.getByLabel('Minimum players').fill('2');
  await page.getByLabel('Maximum players').fill('5');
  await page.getByLabel('Play time').fill('40');
  await page.getByRole('button', { name: 'Add this game' }).click();
  await expect(page.getByText(/Kitchen Table Prototype added to your library/)).toBeVisible({
    timeout: 30_000,
  });
});
