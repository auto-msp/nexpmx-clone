/**
 * E2E — login gate and session behavior (middleware + Auth.js).
 *
 * Covers the route-protection contract from SECURITY.md:
 *  - anonymous /overview → /login?callbackUrl=%2Foverview
 *  - login page redirects sessioned users to /overview
 *  - with a valid DB session cookie, app routes render
 *  - sign out clears the session (cookie gone, app gated again)
 *  - public routes render for everyone
 */
import { test, expect } from "@playwright/test";
import { seedPersona, loginAs, teardownPersona, type TestOrg } from "./helpers";

let trial: TestOrg;

test.beforeAll(async () => {
  trial = await seedPersona("login");
});

test.afterAll(async () => {
  await teardownPersona(trial);
});

test("anonymous /overview redirects to /login with callbackUrl", async ({ request }) => {
  const res = await request.get("/overview", { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  const location = res.headers()["location"] ?? "";
  expect(location.startsWith("/login?callbackUrl=%2Foverview")).toBe(true);
});

test("public pages render without a session", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.goto("/pricing");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("login page redirects sessioned users to /overview", async ({ page }) => {
  await loginAs(page, trial);
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  // /overview is the middleware-approved landing alias, which itself
  // redirects to /dashboard — the final app surface.
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("valid session cookie renders the app", async ({ page }) => {
  await loginAs(page, trial);
  await page.goto("/overview");
  // v0.5.0 dashboard leads with a time-of-day greeting
  await expect(page.getByRole("heading", { name: /good (morning|afternoon|evening)/i })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Modules" })).toBeVisible();
});

test("login page shows the Google sign-in affordance", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: /continue with google/i })).toBeVisible();
  // Legal links acknowledge the placeholders exist in the route surface.
  await expect(page.getByText(/terms of service/i)).toBeVisible();
});

test("sign out clears the session and re-gates the app", async ({ page }) => {
  await loginAs(page, trial);
  await page.goto("/overview");
  // v0.5.0 dashboard leads with a time-of-day greeting
  await expect(page.getByRole("heading", { name: /good (morning|afternoon|evening)/i })).toBeVisible();

  await page.getByRole("button", { name: /sign out/i }).click();
  // signOutAction redirects to "/" (marketing home), which is public.
  await expect(page).toHaveURL(/\/$/);

  // Session row should be gone: app routes must gate again.
  const res = await page.request.get("/overview", { maxRedirects: 0 });
  expect(res.status()).toBe(307);
});
