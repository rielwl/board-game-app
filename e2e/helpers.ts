import { expect, type Page } from '@playwright/test';

/**
 * Helpers shared by the end-to-end specs.
 *
 * Accounts are created fresh per run with a unique email, so the suite never
 * depends on seed state and can be run repeatedly against the same database.
 */

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.test`;
}

export const PASSWORD = 'playwright-demo-password';

export async function signUp(page: Page, name: string, email: string): Promise<void> {
  await page.goto('/sign-up');
  await page.getByLabel('Display name').fill(name);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL(/\/dashboard|\/invite\//, { timeout: 30_000 });
}

export async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL('/', { timeout: 30_000 });
}

export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/sign-in');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/dashboard|\/invite\//, { timeout: 30_000 });
}

/** Creates an event and returns its id, taken from the URL it lands on. */
export async function createEvent(
  page: Page,
  options: { title: string; location?: string; maxAttendees?: string },
): Promise<string> {
  await page.goto('/events/new');
  await page.getByLabel('Title').fill(options.title);
  await page.getByLabel('Location').fill(options.location ?? '42 Kite Street');
  if (options.maxAttendees) {
    await page.getByLabel('Maximum attendance').fill(options.maxAttendees);
  }
  await page.getByRole('button', { name: 'Create game night' }).click();

  // `/events/new` matches a naive `/events/<something>` pattern, so the form
  // page itself would satisfy the wait and hand back the literal id "new".
  await page.waitForURL(
    (url) => /^\/events\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith('/new'),
    { timeout: 30_000 },
  );

  const id = new URL(page.url()).pathname.split('/').pop();
  expect(id).toBeTruthy();
  expect(id).not.toBe('new');
  return id!;
}

/** Creates an invite link for an event the signed-in user organises. */
export async function createInviteLink(page: Page, eventId: string): Promise<string> {
  await page.goto(`/events/${eventId}/invite`);
  await page.getByRole('button', { name: 'Create a new invite link' }).click();

  const field = page.getByLabel('Invite link').first();
  await expect(field).toBeVisible({ timeout: 30_000 });
  const url = await field.inputValue();
  expect(url).toContain('/invite/');
  return url;
}

/** Adds a game from the offline fixture catalog to the signed-in user's library. */
export async function addGameToLibrary(page: Page, gameName: string): Promise<void> {
  await page.goto('/library');
  await page.getByLabel('Search BoardGameGeek').fill(gameName);

  const row = page.getByRole('listitem').filter({ hasText: gameName }).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.getByRole('button', { name: /Add to my games/ }).click();
  await expect(page.getByText(/Added to your library|already in your library/)).toBeVisible({
    timeout: 30_000,
  });
}

/** Marks a library game as offered for an event. */
export async function offerGame(page: Page, eventId: string, gameName: string): Promise<void> {
  await page.goto(`/events/${eventId}/offers`);
  const row = page
    .getByRole('listitem')
    .filter({ hasText: gameName })
    .filter({ has: page.getByRole('button', { name: /I'll bring this/ }) })
    .first();
  await row.getByRole('button', { name: /I'll bring this/ }).click();
  await expect(page.getByText(`You are bringing ${gameName}.`)).toBeVisible({ timeout: 30_000 });
}

export async function setRsvp(page: Page, eventId: string, answer: RegExp): Promise<void> {
  await page.goto(`/events/${eventId}`);
  await page.getByRole('radio', { name: answer }).check();
  await page.getByRole('button', { name: /my answer/ }).click();
  await expect(page.getByText('RSVP saved.')).toBeVisible({ timeout: 30_000 });
}

/**
 * Selects a game in one of the organizer's selection dropdowns.
 *
 * The visible option text includes the score, so the option is located by its
 * name and selected by value.
 */
export async function selectGame(page: Page, fieldLabel: string, gameName: string): Promise<void> {
  const select = page.getByLabel(fieldLabel);
  const option = select.locator('option').filter({ hasText: gameName }).first();
  const value = await option.getAttribute('value');
  expect(value, `no "${gameName}" option in "${fieldLabel}"`).toBeTruthy();
  await select.selectOption(value!);
}

/**
 * Redeems an invite and waits until the browser is inside the event.
 *
 * On success the invite page re-renders and redirects members straight into
 * the event, so the confirmation banner is deliberately transient — landing on
 * the event page is the observable outcome to assert.
 */
export async function joinEvent(page: Page, inviteUrl: string, eventId: string): Promise<void> {
  await page.goto(inviteUrl);
  await page.getByRole('button', { name: 'Join this game night' }).click();
  await page.waitForURL(new RegExp(`/events/${eventId}(/|$)`), { timeout: 30_000 });
}
