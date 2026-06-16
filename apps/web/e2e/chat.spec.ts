import { test, expect } from "@playwright/test";

test.describe("Chat pages (no API required)", () => {
  test("home page loads without crashing", async ({ page }) => {
    await page.goto("/");
    await expect(page).not.toHaveTitle(/error/i);
  });

  test("settings page loads without crashing (unauthenticated)", async ({ page }) => {
    await page.goto("/settings");
    // Without a token the page may redirect to login or render an empty shell.
    // Either way, it should not crash.
    await page.waitForTimeout(2000);
    await expect(page).not.toHaveTitle(/error/i);
  });

  test("navigating directly to a chat URL loads without crashing", async ({ page }) => {
    await page.goto("/c/nonexistent-conversation-id");
    await page.waitForTimeout(2000);
    // The conversation may not exist, but the page should not crash.
    await expect(page).not.toHaveTitle(/error/i);
  });
});

test.describe("Chat flow (requires API)", () => {
  test.beforeEach(async ({ page: p }) => {
    try {
      const res = await p.request.get("http://localhost:4000/health");
      test.skip(res.status() !== 200, "API not reachable — skipping integration E2E");
    } catch {
      test.skip(true, "API not reachable — skipping integration E2E");
    }
  });

  test("login with invalid credentials stays on /login", async ({ page }) => {
    await page.goto("/login");

    await page.locator('input[type="email"]').first().fill("noexist@example.com");
    await page.locator('input[type="password"]').first().fill("wrongpassword");
    await page.getByRole("button", { name: /sign in|iniciar/i }).first().click();

    await page.waitForTimeout(3000);
    expect(page.url()).toContain("/login");
  });
});
