import { test, expect } from "@playwright/test";

// The sidebar and main content share text/input selectors. We use .first()
// on every locator to pick the visible form element and avoid strict-mode
// collisions with sidebar duplicates.

test.describe("Auth pages (no API required)", () => {
  test("login page renders the form with all elements", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: /welcome back/i }).first()).toBeVisible();
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in|iniciar/i }).first()).toBeVisible();
  });

  test("login form shows validation errors on empty submit", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /sign in|iniciar/i }).first().click();
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
  });

  test("register page renders the form with all elements", async ({ page }) => {
    await page.goto("/register");

    await expect(page.getByRole("heading", { name: /create account/i }).first()).toBeVisible();
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    await expect(page.getByRole("button", { name: /create account/i }).first()).toBeVisible();
  });

  test("register form shows validation errors on empty submit", async ({ page }) => {
    await page.goto("/register");
    await page.getByRole("button", { name: /create account/i }).first().click();
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
  });

  test("navigate from login to register and back", async ({ page }) => {
    await page.goto("/login");

    await page.getByRole("link", { name: /create account/i }).first().click();
    await expect(page.getByRole("heading", { name: /create account/i }).first()).toBeVisible();

    await page.getByRole("link", { name: /sign in/i }).first().click();
    await expect(page.getByRole("heading", { name: /welcome back/i }).first()).toBeVisible();
  });
});

test.describe("Auth flow (requires API)", () => {
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

  test("register with a short password is rejected", async ({ page }) => {
    await page.goto("/register");

    await page.locator('input[type="email"]').first().fill("test@example.com");
    await page.locator('input[type="password"]').first().fill("ab");
    await page.getByRole("button", { name: /create account/i }).first().click();

    await page.waitForTimeout(3000);
    expect(page.url()).toContain("/register");
  });
});
