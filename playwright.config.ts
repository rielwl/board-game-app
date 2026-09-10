import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;

/**
 * A deliberately small end-to-end suite covering the journeys that would be
 * expensive to get wrong: organizing, joining by invite, offering games, and
 * locking in a pick.
 *
 * The app under test runs with BGG_ENABLED=false, so the suite never touches
 * BoardGameGeek. That keeps it fast and deterministic, and it doubles as the
 * proof that the product works with the catalog switched off.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    // `next start` against a production build: the same code path users get.
    command: `npx next start --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      BGG_ENABLED: 'false',
      BETTER_AUTH_URL: baseURL,
    },
  },
});
