import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
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
