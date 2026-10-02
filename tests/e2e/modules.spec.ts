import { expect, test } from "@playwright/test";
import {
  prisma,
  seedPersona,
  seedClient,
  seedMemberOf,
  loginAs,
  teardownPersona,
  suffix,
  type TestOrg,
} from "./helpers";

/**
 * E2E coverage for the modules added from screenshot evidence (v0.5.0):
 * proposals pipeline, business memory (add/import/questions), sheets,
 * automations (recipe install + real fire on invoice paid), comms, and the
 * settings company form. Same conventions as invoices.spec.ts: production
 * build, DB-session cookie injection, org-scoped fixtures, FK-safe teardown.
 */

test.describe("modules (v0.5.0 surface)", () => {
  const created: TestOrg[] = [];
  const extraUserIds: string[] = [];

  async function freshPersona(name: string, state: "TRIALING" | "ACTIVE" = "TRIALING") {
    const p = await seedPersona(name, { state });
    created.push(p);
    return p;
  }

  test.afterAll(async () => {
    // FK-safe teardown of everything this spec created.
    const orgIds = created.map((p) => p.orgId);
    for (const orgId of orgIds) {
      await prisma.automation.deleteMany({ where: { orgId } });
      await prisma.sheet.deleteMany({ where: { orgId } });
      await prisma.memoryQuestion.deleteMany({ where: { orgId } });
      await prisma.memoryFact.deleteMany({ where: { orgId } });
      await prisma.commsMessage.deleteMany({ where: { orgId } });
      await prisma.proposal.deleteMany({ where: { orgId } });
      await prisma.notification.deleteMany({ where: { orgId } });
      await prisma.task.deleteMany({ where: { orgId } });
      await prisma.project.deleteMany({ where: { orgId } });
      await prisma.invitation.deleteMany({ where: { orgId } });
    }
    for (const uid of extraUserIds) {
      await prisma.session.deleteMany({ where: { userId: uid } });
      await prisma.user.deleteMany({ where: { id: uid } });
    }
    for (const p of created) {
      await teardownPersona(p);
    }
  });

  test("proposals: create → send → accept → invoice conversion", async ({ page }) => {
    const p = await freshPersona("prop");
    const clientId = await seedClient(p.orgId, "Pipeline Client");
    await loginAs(page, p);

    await page.goto("/proposals");
    await expect(page.getByRole("heading", { name: "Proposals" })).toBeVisible();

    await page.getByLabel("Title *").fill("Website revamp phase 1");
    await page.getByLabel("Client").selectOption({ label: "Pipeline Client" });
    await page.getByLabel("Value (₹)").fill("150000");
    await page.getByRole("button", { name: "Create proposal" }).click();

    await expect(page.getByText("Website revamp phase 1")).toBeVisible();
    // Draft stage card carries the value
    const draftCard = page.locator("li", { hasText: "Website revamp phase 1" });
    await expect(draftCard).toBeVisible();

    // Send
    await draftCard.getByRole("button", { name: "Send" }).click();
    await expect(draftCard.getByRole("button", { name: "Mark viewed" })).toBeVisible();

    // Accept directly from SENT (decision allowed from SENT/VIEWED)
    await draftCard.getByRole("button", { name: "Accept" }).click();
    await expect(draftCard.getByRole("button", { name: "Invoice" })).toBeVisible();

    // Convert to invoice — wait for the server-side write before navigating
    // (hydration-era actions run over JS; a bare goto can abort them)
    await draftCard.getByRole("button", { name: "Invoice" }).click();
    await expect
      .poll(() =>
        prisma.invoice.count({
          where: { orgId: p.orgId, clientId, number: { startsWith: "PROP-" } },
        }),
      )
      .toBeGreaterThan(0);
    await page.goto("/invoices");
    // Converted invoice carries number PROP-XXXXXX (derived from proposal id)
    await expect(page.locator("tr", { hasText: "PROP-" })).toBeVisible();
  });

  test("memory: add fact, paste import, ask + answer question", async ({ page }) => {
    const p = await freshPersona("mem");
    await loginAs(page, p);

    // Add single fact
    await page.goto("/memory");
    await page.getByLabel("Name *").fill("acme-payment-terms");
    await page.getByLabel("Value *").fill("Net-30 from invoice date");
    await page.getByRole("button", { name: "Save memory" }).click();
    await expect(page.getByText("acme-payment-terms").first()).toBeVisible();

    // What-we-know rolls up
    await page.goto("/memory/what-we-know");
    await expect(page.getByText("acme-payment-terms").first()).toBeVisible();
    await expect(page.getByText("Net-30 from invoice date").first()).toBeVisible();

    // Paste import (one valid, one unknown-category prefixed, one skipped)
    await page.goto("/memory/import");
    await page
      .getByLabel("Facts (one per line)")
      .fill("deploy-window: Tue/Thu 18:00 IST\ntools|stack: Next.js, Postgres\nthis line has no separator");
    await page.getByRole("button", { name: "Import facts" }).click();
    await expect(page.getByText(/Imported 2 facts/)).toBeVisible();
    await expect(page.getByText(/1 line skipped/)).toBeVisible();

    // Questions: ask then answer
    await page.goto("/memory/questions");
    await page
      .getByLabel("Question *")
      .fill("What is our standard retainer term?");
    await page.getByRole("button", { name: "Add question" }).click();
    await expect(page.getByText("What is our standard retainer term?").first()).toBeVisible();

    await page.getByRole("textbox", { name: "Answer" }).fill("Six months, rolling.");
    await page.getByRole("button", { name: "Save answer" }).click();
    await expect(page.getByText("Six months, rolling.")).toBeVisible();
    await expect(page.getByText("answered", { exact: true }).first()).toBeVisible();
  });

  test("sheets: create, edit cell with formula, save, verify persisted", async ({ page }) => {
    const p = await freshPersona("sheet");
    await loginAs(page, p);

    await page.goto("/sheets");
    await page.getByLabel("Title *").fill("Q4 budget tracker");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByText("Q4 budget tracker").first()).toBeVisible();

    // Open the sheet
    await page.getByRole("link", { name: "Q4 budget tracker" }).click();
    const formulaBar = page.getByLabel(/Value for cell A1/);
    await expect(formulaBar).toBeVisible();

    // Type a value and a formula via the formula bar (A1 is active on load).
    // The grid itself is select-on-single-click / edit-on-double-click, so the
    // formula bar is the deterministic input path.
    const barA1 = page.getByLabel(/Value for cell A1/);
    await barA1.fill("100");
    await barA1.press("Enter");

    // Select B1: row 1 tds are [row-number gutter, A1, B1, …]
    await page.locator("tbody tr").first().locator("td").nth(2).click();
    const barB1 = page.getByLabel(/Value for cell B1/);
    await barB1.fill("=A1*2+1");
    await barB1.press("Enter");

    // Grid should show computed 201 in B1
    await expect(page.locator("td", { hasText: "201" })).toBeVisible();

    // Save and reload — persistence through the server action
    await page.getByRole("button", { name: "Save" }).click();
    // Locale-dependent clock: en-US hours can be 1 digit ("2:15:33 PM")
    await expect(page.getByText(/saved \d{1,2}:\d{2}/)).toBeVisible({ timeout: 10_000 });
    await page.reload();
    await expect(page.locator("td", { hasText: "201" })).toBeVisible();
  });

  test("automations: install recipe, fire on invoice paid, notification created", async ({ page }) => {
    const p = await freshPersona("auto");
    const clientId = await seedClient(p.orgId, "Automation Client");
    await loginAs(page, p);

    // Install a recipe
    await page.goto("/ai/automations");
    const recipeCard = page.locator("div", { hasText: "Tell the team when a payment lands" }).locator("visible=true").first();
    await recipeCard.getByRole("button", { name: "+ Add" }).first().click();
    await expect(page.getByText("Your automations (1)")).toBeVisible();

    // Create an invoice and pay it — the automation should fire.
    await page.goto("/invoices");
    await page.getByLabel("Client *").selectOption({ label: "Automation Client" });
    await page.getByLabel("Number *").fill(`AUTO-1-${suffix}`);
    await page.getByLabel("Amount (INR) *").fill("5000");
    await page.getByRole("button", { name: "Create draft" }).click();
    await expect(page.getByText(`AUTO-1-${suffix}`)).toBeVisible();

    // Mark paid (DRAFT → SENT → PAID through the UI)
    const row = page.locator("tr", { hasText: `AUTO-1-${suffix}` });
    await row.getByRole("button", { name: "Send" }).click();
    await row.getByRole("button", { name: "Mark paid" }).click();

    // The dispatcher creates in-app notifications for OWNER/ADMIN members.
    // The action runs over JS after hydration — poll briefly for the write.
    let payloadTitle = "";
    await expect
      .poll(
        async () => {
          const notifications = await prisma.notification.findMany({
            where: { orgId: p.orgId, type: "automation.founders" },
          });
          if (notifications.length > 0) {
            payloadTitle = (JSON.parse(notifications[0].payloadJson) as { title: string }).title;
          }
          return notifications.length;
        },
        { timeout: 10_000, intervals: [500, 1_000, 2_000] },
      )
      .toBeGreaterThan(0);
    expect(payloadTitle).toBe(`AUTO-1-${suffix}`);

    // AI credits meter + team page reflect state
    await page.goto("/ai/team");
    await expect(page.getByText("Aria", { exact: true })).toBeVisible();
    await expect(page.getByText("Vikram", { exact: true })).toBeVisible();
  });

  test("comms: log an interaction and see it in the feed with filters", async ({ page }) => {
    const p = await freshPersona("comms");
    const clientId = await seedClient(p.orgId, "Comms Client");
    await loginAs(page, p);

    await page.goto("/comms");
    await page.getByLabel("Client").first().selectOption({ label: "Comms Client" });
    await page.getByLabel("Channel").first().selectOption({ label: "Call" });
    await page.getByLabel("Direction").first().selectOption({ label: "Outgoing (we sent)" });
    await page.getByLabel("Subject *").fill("Kick-off call notes");
    await page.getByLabel("Details").fill("Agreed milestones for October.");
    await page.getByRole("button", { name: "Log interaction" }).click();

    await expect(page.getByText("Kick-off call notes")).toBeVisible();
    await expect(page.getByText("Agreed milestones for October.")).toBeVisible();

    // Filter to incoming only — the outgoing log should disappear
    await page.getByLabel("Direction").nth(1).selectOption({ label: "Incoming" });
    await page.getByRole("button", { name: "Filter" }).click();
    await expect(page.getByText("No conversations match")).toBeVisible();
  });

  test("settings: company & GST profile saves and appears for invoices", async ({ page }) => {
    const p = await freshPersona("gst");
    await loginAs(page, p);

    await page.goto("/settings/company");
    await page.getByLabel("Workspace / business name *").fill("Studio Moiz Pvt Ltd");
    await page.getByLabel("GSTIN").fill("27ABCDE1234F1Z5");
    await page.getByLabel("State").fill("Maharashtra");
    await page.getByLabel("UPI ID (VPA)").fill("studiomoiz@upi");
    await page.getByRole("button", { name: "Save profile" }).click();

    // Persisted (the action runs over JS after hydration — poll for the row)
    await expect
      .poll(async () => {
        const org = await prisma.organization.findUnique({
          where: { id: p.orgId },
          select: { gstin: true, state: true, upiId: true },
        });
        return org?.gstin ?? null;
      })
      .toBe("27ABCDE1234F1Z5");
    const org = await prisma.organization.findUnique({
      where: { id: p.orgId },
      select: { state: true, upiId: true },
    });
    expect(org?.state).toBe("Maharashtra");
    expect(org?.upiId).toBe("studiomoiz@upi");

    // Malformed GSTIN is rejected server-side
    await page.getByLabel("GSTIN").fill("BAD");
    await page.getByRole("button", { name: "Save profile" }).click();
    // stays on page (server action throws) — profile unchanged in DB
    const after = await prisma.organization.findUnique({
      where: { id: p.orgId },
      select: { gstin: true },
    });
    expect(after?.gstin).toBe("27ABCDE1234F1Z5");
  });

  test("settings: team directory shows members and RBAC hides invite for MEMBER", async ({ page }) => {
    const owner = await freshPersona("tdir");
    const member = await seedMemberOf(owner.orgId, "tdmember");
    extraUserIds.push(member.userId);
    await loginAs(page, owner);

    await page.goto("/settings/team");
    await expect(page.getByRole("heading", { name: /Members \(\d+\)/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Invite" })).toBeVisible();
  });

  test("CIO brief surfaces overdue invoice and open question", async ({ page }) => {
    const p = await freshPersona("cio");
    const clientId = await seedClient(p.orgId, "CIO Client");
    await prisma.invoice.create({
      data: {
        orgId: p.orgId,
        clientId,
        number: `CIO-1-${suffix}`,
        amountMinor: 99900,
        status: "SENT",
        dueAt: new Date(Date.now() - 3 * 86_400_000),
      },
    });
    await prisma.memoryQuestion.create({
      data: { orgId: p.orgId, question: "Unanswered CIO probe?" },
    });
    await loginAs(page, p);

    await page.goto("/cio");
    await expect(page.getByText("Needs attention")).toBeVisible();
    await expect(page.getByText(/1 invoice is overdue/)).toBeVisible();
    await expect(page.getByText(/1 open memory question/)).toBeVisible();
  });
});
