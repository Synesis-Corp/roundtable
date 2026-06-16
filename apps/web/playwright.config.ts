import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.PLAYWRIGHT_PORT ?? "3000";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["html"], ["github"]] : "html",
  timeout: 30_000,
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    // In CI the stack runs on :80; accept localhost without TLS.
    ...(process.env.CI ? { ignoreHTTPSErrors: true } : {}),
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  // In CI, docker-compose provides the web server — no need to spawn one.
  // Locally, `pnpm dev` starts Vite (proxies /api → :4000) and we reuse an
  // existing instance so the dev doesn't have to restart every run.
  ...(process.env.CI
    ? {}
    : {
        webServer: {
          command: "pnpm dev",
          url: BASE_URL,
          reuseExistingServer: true,
          timeout: 30_000,
        },
      }),
});
