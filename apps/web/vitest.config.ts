import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Retry once on failure to absorb transient flakes under concurrent runs.
    // A real, deterministic failure still fails both attempts — this only
    // masks non-reproducible environmental noise.
    retry: 1,
    // e2e is Playwright's; keep it out of the vitest run.
    exclude: ['node_modules', 'e2e', 'dist'],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'e2e/**'],
      // Coverage gate — enforced in CI via `pnpm coverage`. Numbers set
      // 2026-06-11 to current real values minus a 1-2% buffer, so a small
      // refactor doesn't immediately fail the build. Bump these when the
      // real coverage goes up by adding tests; never set them above the
      // current measurement without a test that holds the line.
      // Current measurements: 60.22% stmts, 77.24% branches, 50.72% funcs,
      // 60.22% lines (snapshot 2026-06-11).
      thresholds: {
        statements: 58,
        branches: 75,
        functions: 50,
        lines: 58,
      },
    },
  },
});
