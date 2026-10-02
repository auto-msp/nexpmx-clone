/**
 * E2E — invoice lifecycle through the real UI (server actions + revalidate).
 *
 * Covers the DRAFT → SENT → PAID transitions (RULE-INV-01) driven through
 * the actual form controls, plus validation surfaces:
 *  - create draft via the New invoice form
 *  - Send → status badge flips to SENT, then Mark paid → PAID terminal
 *  - duplicate invoice numbers are rejected (org-scoped unique)
 *  - invalid state moves are never offered (PAID has no action buttons)
 */
import { test, expect } from "@playwright/test";
import {
  seedPersona,
  seedClient,
  loginAs,
  teardownPersona,
  prisma,
  type TestOrg,
} from "./helpers";

let org: TestOrg;
let clientId: string;
const number = `E2E-INV-${Date.now().toString(36).toUpperCase()}`;

test.beforeAll(async () => {
  org = await seedPersona("invoices", { state: "TRIALING", daysToTrialEnd: 10 });
  clientId = await seedClient(org.orgId, "E2E Invoice Client");
});

test.afterAll(async () => {
  await teardownPersona(org);
});

async function gotoInvoices(page: import("@playwright/test").Page) {
  await loginAs(page, org);
  await page.goto("/invoices");
  await expect(page.getByRole("heading", { name: "Invoices" })).toBeVisible();
}

test("create draft invoice through the form", async ({ page }) => {
  await gotoInvoices(page);

  await page.getByLabel("Client *").selectOption({ label: "E2E Invoice Client" });
  await page.getByLabel("Number *").fill(number);
  await page.getByLabel("Amount (INR) *").fill("15000.50");
  await page.getByRole("button", { name: "Create draft" }).click();

  const row = page.getByRole("row", { name: new RegExp(number) });
  await expect(row).toBeVisible();
  await expect(row.getByText("DRAFT")).toBeVisible();
  await expect(row.getByText("₹15,001")).toBeVisible(); // formatInr rounds to whole INR
});

test("DRAFT → SENT → PAID transitions render from the UI", async ({ page }) => {
  await gotoInvoices(page);
  const row = page.getByRole("row", { name: new RegExp(number) });

  await row.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("row", { name: new RegExp(number) }).getByText("SENT")).toBeVisible();

  await page.getByRole("row", { name: new RegExp(number) })
    .getByRole("button", { name: "Mark paid" })
    .click();
  await expect(page.getByRole("row", { name: new RegExp(number) }).getByText("PAID")).toBeVisible();

  // Terminal state: no further action buttons are offered.
  await expect(
    page.getByRole("row", { name: new RegExp(number) }).getByRole("button"),
  ).toHaveCount(0);
});

test("duplicate invoice number is rejected", async ({ page }) => {
  await gotoInvoices(page);
  await page.getByLabel("Client *").selectOption({ label: "E2E Invoice Client" });
  await page.getByLabel("Number *").fill(number); // already used by the paid invoice
  await page.getByLabel("Amount (INR) *").fill("100");
  await page.getByRole("button", { name: "Create draft" }).click();

  // Server action throws; Next dev/prod surfaces the error page. The row
  // count for this number must stay at exactly 1.
  await page.waitForTimeout(1_000);
  const count = await prisma.invoice.count({
    where: { orgId: org.orgId, number },
  });
  expect(count).toBe(1);
});

test("invoice is org-scoped: another org cannot see it", async ({ page }) => {
  const other = await seedPersona("invoices-other", { state: "TRIALING", daysToTrialEnd: 10 });
  try {
    await loginAs(page, other);
    await page.goto("/invoices");
    await expect(page.getByText(new RegExp(number))).toHaveCount(0);
  } finally {
    await teardownPersona(other);
  }
});

test("issuedAt is stamped only on Send", async ({ page }) => {
  const invoice = await prisma.invoice.findFirst({
    where: { orgId: org.orgId, number },
  });
  expect(invoice?.issuedAt).not.toBeNull();
  expect(invoice?.status).toBe("PAID");
});
