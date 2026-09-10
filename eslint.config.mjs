import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

/**
 * ESLint 9 flat config.
 *
 * eslint-config-next 16 ships native flat-config arrays, so they are spread in
 * directly — no `FlatCompat` shim needed.
 */
const config = [
  {
    ignores: [
      '.next/**',
      // Harness-created git worktrees hold their own copy of the source tree.
      '.claude/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
    ],
  },

  ...nextCoreWebVitals,
  ...nextTypeScript,

  {
    rules: {
      // Underscore-prefixed names are the convention here for the deliberately
      // unused parameters that server-action signatures require.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },

  {
    // The seed is a CLI script; console output is the whole point.
    files: ['prisma/seed.ts'],
    rules: { 'no-console': 'off' },
  },
];

export default config;
