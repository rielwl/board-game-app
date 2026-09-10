import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // `server-only` throws on import outside a React Server Component. Under
      // Next.js that is exactly the guard we want; in Node tests it just stops
      // server modules being importable at all, so it is stubbed out here.
      'server-only': fileURLToPath(new URL('./tests/helpers/server-only-stub.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Playwright specs live in e2e/ and are run by `npm run test:e2e`.
    exclude: ['e2e/**', 'node_modules/**'],
    globals: false,
  },
});
