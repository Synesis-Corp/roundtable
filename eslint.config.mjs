// Flat config — applies to the whole pnpm monorepo (apps/* + packages/*).
// Non-type-aware base (fast, robust). `no-explicit-any` starts as `warn`;
// it will be bumped to `error` once FASE 6 removes the remaining `any`.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/*.config.{js,cjs,mjs,ts}',
      '**/vite.config.*',
      '**/vitest.config.*',
      'packages/db/prisma/migrations/**',
      '.opencode/**', // opencode agent tooling, not part of the app
      '.cursor/**', // cursor agent skills, not part of the app
      '.github/skills/**', // dropped-in agent skills, not part of the app
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Shared TS/TSX rules across the monorepo.
    files: ['**/*.{ts,tsx}'],
    rules: {
      // Production code must be `any`-free (FASE 6). Tests relax this below.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Backend + packages run in Node (incl. build/maintenance scripts).
    files: ['apps/api/**/*.ts', 'apps/api/scripts/**/*.mjs', 'packages/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // Frontend runs in the browser; enforce React hooks rules.
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: { ...globals.browser } },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  {
    // Test files: allow console and relax a few rules.
    files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      'no-console': 'off',
      // Mocks legitimately need `any` (e.g. `null as any` for unused stream
      // fields). Forcing `as unknown as T` here hurts readability more than it helps.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  // Disable rules that conflict with Prettier formatting (must be last).
  prettier
);
