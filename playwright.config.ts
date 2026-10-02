import { defineConfig } from "@playwright/test";
import path from "node:path";
import { readFileSync } from "node:fs";

/**
 * Playwright E2E (KNOWN_LIMITATIONS #7).
 *
 * Strategy: the suite runs against a REAL production build (`npm run build &&
 * npm run start`) talking to the dev Postgres. There is no credentials
 * provider in this app (Google OAuth only), so tests do not log in through
 * the UI — they seed User/Session rows directly via Prisma and inject the
 * `authjs.session-token` cookie (tests/e2e/helpers.ts). That exercises the
 * same session lookup real users hit, without depending on Google.
 *
 * Billing note: RAZORPAY_KEY_ID/KEY_SECRET are forced EMPTY for the server
 * process so checkout is deterministically in contact-us mode regardless of
 * the host .env; RAZORPAY_WEBHOOK_SECRET alone is kept so the signed-webhook
 * activation path is testable end-to-end (signature verify stays active).
 */

// Same loader contract as vitest.config.ts / prisma.config.ts: real env wins.
function loadDotEnvIntoProcess() {
  try {
    const raw = readFileSync(".env", "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const key = m[1];
      const value = m[2].replace(/^["']|["']$/g, "");
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // No .env — rely on the real environment (CI).
  }
}
loadDotEnvIntoProcess();

// Shared between the server process (webServer.env) and the test runner
// (tests/e2e/helpers.ts signs webhooks with the same value).
process.env.RAZORPAY_WEBHOOK_SECRET ??= "e2e-whsec";

const PORT = Number(process.env.E2E_PORT ?? 3100);
export const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: false, // shared dev DB; workers would fight over fixtures
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  forbidOnly: !!process.env.CI,
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  webServer: {
    // DOCUMENT_STORAGE_DIR must exist and be writable or boot env validation
    // (src/lib/env.ts) refuses to start — create it in the same command.
    command: "mkdir -p .e2e-docs && npm run start",
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      PORT: String(PORT),
      DOCUMENT_STORAGE_DIR: path.resolve(".e2e-docs"),
      // AUTH_URL is Auth.js's trusted origin: sign-in/out redirects resolve
      // against it, so it must match the port the server actually runs on.
      AUTH_URL: BASE_URL,
      // Deterministic contact-us checkout mode (see header note).
      RAZORPAY_KEY_ID: "",
      RAZORPAY_KEY_SECRET: "",
      RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET,
    },
    cwd: path.resolve("."),
  },
});
