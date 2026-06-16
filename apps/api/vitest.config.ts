import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      // Coverage gate — enforced in CI via `pnpm coverage`. Numbers set
      // 2026-06-11 to current real values minus a 1-2% buffer, so a small
      // refactor doesn't immediately fail the build. Bump these when the
      // real coverage goes up by adding tests; never set them above the
      // current measurement without a test that holds the line.
      // Current measurements: 81.31% stmts, 66.9% branches, 79.16% funcs,
      // 81.31% lines (snapshot 2026-06-11).
      thresholds: {
        statements: 80,
        branches: 65,
        functions: 75,
        lines: 80,
      },
    },
  },
});
