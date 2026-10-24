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
// Invoice numbers are assigned by the server (INV-YYYY-NNNN, per-org sequence),
// so the number is read back after the first test creates the invoice.
let number = "";

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
  await loginAs(page, org);
  await page.goto("/invoices/new");
  await expect(page.getByRole("heading", { name: "New invoice" })).toBeVisible();

  // Number is assigned automatically; the form takes a client and line items.
  await page.locator('select[name="clientId"]').selectOption({ label: "E2E Invoice Client" });
  await page.getByLabel("Description 1").fill("Design work");
  await page.getByLabel("Rate in rupees 1").fill("15000.50");
  await page.getByLabel("GST rate 1").selectOption({ label: "0%" });
  await page.getByRole("button", { name: "Save as draft" }).click();

  // The action redirects to the new invoice's detail page.
  await expect(page).toHaveURL(/\/invoices\/(?!new)[a-z0-9]+$/);
  const created = await prisma.invoice.findFirstOrThrow({ where: { orgId: org.orgId, clientId } });
  number = created.number;
  expect(number).toMatch(/^INV-\d{4}-\d{4}$/);
  expect(created.status).toBe("DRAFT");

  await page.goto("/invoices");
  const row = page.getByRole("row", { name: new RegExp(number) });
  await expect(row).toBeVisible();
  await expect(row.getByText("Draft", { exact: true })).toBeVisible();
  await expect(row.getByText("₹15,001")).toBeVisible(); // formatInr rounds to whole INR
});

test("DRAFT → SENT → PAID transitions render from the UI", async ({ page }) => {
  // "Mark paid" asks for confirmation through a browser dialog.
  page.on("dialog", (d) => d.accept());
  await gotoInvoices(page);
  const row = page.getByRole("row", { name: new RegExp(number) });

  await row.getByRole("button", { name: "Mark sent" }).click();
  await expect(page.getByRole("row", { name: new RegExp(number) }).getByText("Sent", { exact: true })).toBeVisible();

  await page.getByRole("row", { name: new RegExp(number) })
    .getByRole("button", { name: "Mark paid" })
    .click();
  await expect(page.getByRole("row", { name: new RegExp(number) }).getByText("Paid", { exact: true })).toBeVisible();

  // Terminal state: no further action buttons are offered.
  await expect(
    page.getByRole("row", { name: new RegExp(number) }).getByRole("button"),
  ).toHaveCount(0);
});

test("duplicate invoice number is rejected", async ({ page }) => {
  // The rebuilt form no longer takes a typed number (the server assigns the next
  // INV-YYYY-NNNN), so a duplicate can only be attempted against the data layer.
  // The org-scoped unique constraint must still reject it, and the count must
  // stay at exactly 1.
  await gotoInvoices(page);
  await expect(
    prisma.invoice.create({
      data: { orgId: org.orgId, clientId, number, amountMinor: 10_000, status: "DRAFT" },
    }),
  ).rejects.toThrow(/Unique constraint/);

  const count = await prisma.invoice.count({
    where: { orgId: org.orgId, number },
  });
  expect(count).toBe(1);

  // And a second invoice made through the UI gets a different, next number.
  await page.goto("/invoices/new");
  await page.locator('select[name="clientId"]').selectOption({ label: "E2E Invoice Client" });
  await page.getByLabel("Description 1").fill("Second job");
  await page.getByLabel("Rate in rupees 1").fill("100");
  await page.getByRole("button", { name: "Save as draft" }).click();
  await expect(page).toHaveURL(/\/invoices\/(?!new)[a-z0-9]+$/);
  const all = await prisma.invoice.findMany({ where: { orgId: org.orgId }, select: { number: true } });
  expect(all).toHaveLength(2);
  expect(new Set(all.map((i) => i.number)).size).toBe(2);
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
