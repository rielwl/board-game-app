import { expect, test } from '@playwright/test';

import {
  addGameToLibrary,
  createEvent,
  createInviteLink,
  joinEvent,
  offerGame,
  selectGame,
  setRsvp,
  signIn,
  signOut,
  signUp,
  uniqueEmail,
} from './helpers';

/**
 * The whole journey, end to end, in one spec: organize, invite, join, RSVP,
 * offer games, set preferences, read the ranking, and lock in a pick.
 *
 * It is one long test on purpose. The value here is that the *sequence* works
 * across two real accounts and real sessions; splitting it would mean either
 * re-running the setup each time or sharing state between tests.
 */
test('two people plan a game night from scratch', async ({ page }) => {
  const organizerEmail = uniqueEmail('organizer');
  const attendeeEmail = uniqueEmail('attendee');

  // --- Criterion 1: a user can register and create an event ----------------
  await signUp(page, 'Orla Organizer', organizerEmail);
  const eventId = await createEvent(page, { title: 'Playwright game night' });

  await expect(page.getByRole('heading', { name: 'Playwright game night' })).toBeVisible();
  await expect(page.getByText('You organise this night')).toBeVisible();

  // The organizer is a Yes from the start.
  await expect(page.getByRole('heading', { name: /Yes\b/ }).first()).toBeVisible();

  // --- Criterion 3 (organizer half): add games and offer them --------------
  await addGameToLibrary(page, 'Codenames');
  await addGameToLibrary(page, 'Pandemic');
  await offerGame(page, eventId, 'Codenames');
  await offerGame(page, eventId, 'Pandemic');

  // --- Criterion 2: another user joins by invite and RSVPs -----------------
  const inviteUrl = await createInviteLink(page, eventId);
  await signOut(page);

  await page.goto(inviteUrl);
  // Before joining, the invitee sees the title but not the private location.
  await expect(page.getByRole('heading', { name: 'Playwright game night' })).toBeVisible();
  await expect(page.getByText('42 Kite Street')).toHaveCount(0);

  await signUp(page, 'Adam Attendee', attendeeEmail);
  await joinEvent(page, inviteUrl, eventId);

  await setRsvp(page, eventId, /Yes, count me in/);
  // Now that they are a member, the location is visible.
  await expect(page.getByText('42 Kite Street')).toBeVisible();

  // --- Criterion 3 (attendee half) ----------------------------------------
  await addGameToLibrary(page, '7 Wonders');
  await offerGame(page, eventId, '7 Wonders');

  // --- Criterion 4: record preferences -------------------------------------
  await page.goto(`/events/${eventId}/preferences`);
  await page.getByLabel('Lightest you would enjoy').fill('1');
  await page.getByLabel('Heaviest you would enjoy').fill('2.5');
  await page.getByLabel('Longest you want to play').fill('60');
  await page.getByRole('radio', { name: /Something new/ }).check();
  await page.getByRole('button', { name: 'Save my preferences' }).click();
  await expect(page.getByText('Preferences saved.')).toBeVisible({ timeout: 30_000 });

  // Requesting a specific game.
  const requestRow = page.getByRole('listitem').filter({ hasText: 'Codenames' }).first();
  await requestRow.getByRole('button', { name: /Request this/ }).click();
  await expect(page.getByText('Added to your requests.')).toBeVisible({ timeout: 30_000 });

  // --- Criterion 5: only eligible games are ranked, with explanations -------
  await page.goto(`/events/${eventId}/recommendations`);
  await expect(page.getByRole('heading', { name: 'Play tonight' })).toBeVisible();

  // Two Yes attendees, so the ranking is for two players.
  await expect(page.getByText(/Ranked for 2 players/)).toBeVisible();

  // Codenames is offered and plays 2, so it must be ranked and explained.
  const codenames = page.getByRole('listitem').filter({ hasText: 'Codenames' }).first();
  await expect(codenames).toBeVisible();
  await expect(codenames.getByText(/\/100/).first()).toBeVisible();
  await codenames.getByRole('group').getByText(/How this scored/).click();
  await expect(codenames.getByRole('table')).toBeVisible();
  await expect(codenames.getByRole('rowheader', { name: /Player count/ })).toBeVisible();
  await expect(codenames.getByRole('rowheader', { name: /Complexity fit/ })).toBeVisible();
  await expect(codenames.getByText(/Requested by 1 attendee/)).toBeVisible();

  // --- Criterion 6 (part one): the organizer adjusts the target ------------
  await signOut(page);
  await signIn(page, organizerEmail);
  await page.goto(`/events/${eventId}/recommendations`);

  await page.getByLabel('Target player count').fill('3');
  await page.getByRole('button', { name: 'Apply settings' }).click();
  await expect(page.getByText(/Ranked for 3 players/)).toBeVisible({ timeout: 30_000 });

  // Pandemic plays 2-4, so at three players it stays eligible; Codenames also
  // plays 2-8. 7 Wonders needs at least two and is fine as well.
  await expect(page.getByRole('heading', { name: /^#1 / })).toBeVisible();

  // Put it back to two so the rest of the flow is predictable.
  await page.getByLabel('Target player count').fill('2');
  await page.getByRole('button', { name: 'Apply settings' }).click();
  await expect(page.getByText(/Ranked for 2 players/)).toBeVisible({ timeout: 30_000 });

  // --- Criterion 6 (part two): lock a primary game plus backups ------------
  // Option labels carry the score ("Codenames — 82.5/100"), so pick by the
  // option's value rather than trying to reproduce the exact label text.
  await selectGame(page, 'Primary game', 'Codenames');
  await selectGame(page, 'First backup', 'Pandemic');
  await page.getByRole('button', { name: /Lock this in/ }).click();
  await expect(page.getByText(/Locked in Codenames/)).toBeVisible({ timeout: 30_000 });

  // --- The Tonight view ----------------------------------------------------
  await page.goto(`/events/${eventId}/tonight`);
  await expect(page.getByText('We are playing')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Codenames' })).toBeVisible();
  await expect(page.getByText('If that falls through')).toBeVisible();
  await expect(page.getByText('Pandemic')).toBeVisible();
  await expect(page.getByText('42 Kite Street')).toBeVisible();
  const tonight = page.getByRole('main');
  await expect(tonight.getByText('Orla Organizer', { exact: true })).toBeVisible();
  await expect(tonight.getByText('Adam Attendee', { exact: true })).toBeVisible();
});

test('"Pick for us" only ever lands on an eligible game', async ({ page }) => {
  const email = uniqueEmail('roller');
  await signUp(page, 'Rita Roller', email);
  const eventId = await createEvent(page, { title: 'Dice decide' });

  await addGameToLibrary(page, 'Codenames');
  await addGameToLibrary(page, 'Splendor');
  await addGameToLibrary(page, 'Twilight Struggle');
  await offerGame(page, eventId, 'Codenames');
  await offerGame(page, eventId, 'Splendor');
  await offerGame(page, eventId, 'Twilight Struggle');

  await page.goto(`/events/${eventId}/recommendations`);

  // Only the organizer has said yes, so plan for a table of four instead.
  await page.getByLabel('Target player count').fill('4');
  await page.getByRole('button', { name: 'Apply settings' }).click();
  await expect(page.getByText(/Ranked for 4 players/)).toBeVisible({ timeout: 30_000 });

  // Codenames (2-8) and Splendor (2-4) are eligible; Twilight Struggle is
  // strictly two players, so it must be ruled out and must never be drawn.
  await expect(page.getByRole('heading', { name: 'Close, but ruled out' })).toBeVisible();
  await expect(page.getByText(/Plays 2–2, but you are planning for 4/)).toBeVisible();

  const draw = page.getByTestId('pick-result');
  for (let roll = 0; roll < 5; roll += 1) {
    await page.getByRole('button', { name: /Pick for us|Roll again/ }).click();
    await expect(draw.getByText('The dice say…')).toBeVisible({ timeout: 30_000 });
    // Twilight Struggle still appears further down under "Close, but ruled
    // out" — what matters is that the draw itself never lands on it.
    await expect(draw.getByText('Twilight Struggle')).toHaveCount(0);
  }

  await page.getByRole('button', { name: /Lock in / }).click();
  await expect(page.getByText(/Locked in /)).toBeVisible({ timeout: 30_000 });
});
