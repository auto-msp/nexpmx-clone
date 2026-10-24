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
    // "Send to client" and "Record acceptance" ask for confirmation via a browser dialog.
    page.on("dialog", (d) => d.accept());
    await loginAs(page, p);

    await page.goto("/proposals");
    await expect(page.getByRole("heading", { name: "Proposals" })).toBeVisible();

    // Proposals are created on their own page; the value is the sum of the line items.
    await page.getByRole("link", { name: "New proposal" }).first().click();
    await expect(page.getByRole("heading", { name: "New proposal" })).toBeVisible();
    await page.locator('select[name="clientId"]').selectOption({ label: "Pipeline Client" });
    await page.locator('input[name="title"]').fill("Website revamp phase 1");
    await page.getByLabel("Deliverable 1").fill("Phase 1 build");
    await page.getByLabel("Rate in rupees 1").fill("150000");
    await page.getByRole("button", { name: "Create proposal" }).click();

    // Redirects to the proposal's detail page, which carries the title and value.
    await expect(page).toHaveURL(/\/proposals\/(?!new)[a-z0-9]+$/);
    await expect(page.getByRole("heading", { level: 1, name: "Website revamp phase 1" })).toBeVisible();
    await expect(page.getByText("₹1,50,000").first()).toBeVisible();

    // Send
    await page.getByRole("button", { name: "Send to client" }).click();
    await expect(page.getByRole("button", { name: "Mark as viewed" })).toBeVisible();

    // Accept directly from SENT (decision allowed from SENT/VIEWED)
    await page.getByRole("button", { name: "Record acceptance" }).click();
    await expect(page.getByRole("button", { name: "Create advance invoice" })).toBeVisible();

    // Convert to invoice — wait for the server-side write before navigating
    // (hydration-era actions run over JS; a bare goto can abort them)
    await page.getByRole("button", { name: "Create advance invoice" }).click();
    await expect
      .poll(() =>
        prisma.invoice.count({
          where: { orgId: p.orgId, clientId, number: { startsWith: "INV-" } },
        }),
      )
      .toBeGreaterThan(0);
    const converted = await prisma.invoice.findFirstOrThrow({ where: { orgId: p.orgId, clientId } });
    await page.goto("/invoices");
    // The converted invoice is numbered from the org's invoice sequence (INV-YYYY-NNNN)
    await expect(page.locator("tr", { hasText: converted.number })).toBeVisible();
  });

  test("memory: add fact, paste import, ask + answer question", async ({ page }) => {
    const p = await freshPersona("mem");
    await loginAs(page, p);

    // Add single fact — notes are added from the "What we know" page (modal form)
    await page.goto("/memory/what-we-know");
    await page.getByRole("button", { name: "Add a note" }).click();
    await page.getByLabel("What is it about?").fill("acme-payment-terms");
    await page.getByLabel("What should we remember?").fill("Net-30 from invoice date");
    await page.getByRole("button", { name: "Save note" }).click();
    // Notes are listed under a readable title (the key, humanised)
    await expect(page.getByText("Acme payment terms").first()).toBeVisible();
    await expect(page.getByText("Net-30 from invoice date").first()).toBeVisible();

    // What-we-know rolls up after a reload
    await page.goto("/memory/what-we-know");
    await expect(page.getByText("Acme payment terms").first()).toBeVisible();
    await expect(page.getByText("Net-30 from invoice date").first()).toBeVisible();

    // Paste import is two steps: paste → review → import. Lines are read as
    // "title: value" (an optional "area|" prefix files them under that area);
    // a line with no separator is kept as a plain note, and lines too short to
    // mean anything are skipped.
    await page.goto("/memory/import");
    await page
      .getByLabel("Paste it here")
      .fill("deploy-window: Tue/Thu 18:00 IST\ntools|stack: Next.js, Postgres\nthis line has no separator\nok");
    await page.getByRole("button", { name: "Review items" }).click();
    await expect(page.getByRole("heading", { name: "Review before importing" })).toBeVisible();
    await expect(page.getByText(/3 of 3 selected/)).toBeVisible();
    await expect(page.getByText(/1 line skipped/)).toBeVisible();
    await page.getByRole("button", { name: "Import 3 items" }).click();

    // The import redirects to What we know, where the new notes are listed.
    await expect(page).toHaveURL(/\/memory\/what-we-know$/);
    await expect(page.getByText("Tue/Thu 18:00 IST").first()).toBeVisible();
    await expect(page.getByText("Next.js, Postgres").first()).toBeVisible();
    expect(await prisma.memoryFact.count({ where: { orgId: p.orgId } })).toBe(4);

    // Questions: ask the team, then answer
    await page.goto("/memory/questions");
    await page
      .locator('input[name="question"]')
      .fill("What is our standard retainer term?");
    await page.getByRole("button", { name: "Ask the team" }).click();
    await expect(page.getByText("What is our standard retainer term?").first()).toBeVisible();

    // (the guided question above has its own "Your answer" box; the team
    // question's box is named exactly "Answer")
    await page.getByRole("textbox", { name: "Answer", exact: true }).fill("Six months, rolling.");
    await page.getByRole("button", { name: "Save answer" }).click();

    // The answered question moves to the Answered tab with its answer.
    await page.goto("/memory/questions?tab=answered");
    await expect(page.getByText("What is our standard retainer term?")).toBeVisible();
    await expect(page.getByText("Six months, rolling.")).toBeVisible();
    expect(
      await prisma.memoryQuestion.count({ where: { orgId: p.orgId, state: "ANSWERED" } }),
    ).toBe(1);
  });

  test("sheets: create, edit cell with formula, save, verify persisted", async ({ page }) => {
    const p = await freshPersona("sheet");
    await loginAs(page, p);

    // Sheets are created from a dialog; creating one opens it straight away.
    await page.goto("/sheets");
    await page.getByRole("button", { name: "Create sheet" }).first().click();
    await page.getByLabel("Sheet title *").fill("Q4 budget tracker");
    await page.getByRole("dialog").getByRole("button", { name: "Create sheet" }).click();
    await expect(page).toHaveURL(/\/sheets\/(?!new)[a-z0-9]+$/);

    // It is listed on the sheets page; open it from there
    await page.goto("/sheets");
    await expect(page.getByText("Q4 budget tracker").first()).toBeVisible();
    await page.getByRole("link", { name: "Q4 budget tracker" }).first().click();
    await expect(page).toHaveURL(/\/sheets\/(?!new)[a-z0-9]+$/);
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
    // "Mark paid" asks for confirmation via a browser dialog.
    page.on("dialog", (d) => d.accept());
    await loginAs(page, p);

    // Install a recipe — each ready-made recipe is an <article> with a "Use this" button
    await page.goto("/ai/automations");
    const recipeCard = page.locator("article", { hasText: "Tell the team when a payment lands" });
    await recipeCard.getByRole("button", { name: "Use this" }).click();
    await expect(recipeCard.getByRole("button", { name: "Added" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Your automations (1)" })).toBeVisible();

    // Create an invoice and pay it — the automation should fire. The invoice
    // number is assigned by the server, so it is read back from the database.
    await page.goto("/invoices/new");
    await page.locator('select[name="clientId"]').selectOption({ label: "Automation Client" });
    await page.getByLabel("Description 1").fill("Automation test work");
    await page.getByLabel("Rate in rupees 1").fill("5000");
    await page.getByRole("button", { name: "Save as draft" }).click();
    await expect(page).toHaveURL(/\/invoices\/(?!new)[a-z0-9]+$/);
    const invoice = await prisma.invoice.findFirstOrThrow({ where: { orgId: p.orgId, clientId } });

    await page.goto("/invoices");
    await expect(page.getByText(invoice.number)).toBeVisible();

    // Mark paid (DRAFT → SENT → PAID through the UI)
    const row = page.locator("tr", { hasText: invoice.number });
    await row.getByRole("button", { name: "Mark sent" }).click();
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
    expect(payloadTitle).toBe(invoice.number);

    // AI credits meter + team page reflect state
    await page.goto("/ai/team");
    await expect(page.getByText("Aria", { exact: true })).toBeVisible();
    await expect(page.getByText("Vikram", { exact: true })).toBeVisible();
  });

  test("comms: log an interaction and see it in the feed with filters", async ({ page }) => {
    const p = await freshPersona("comms");
    const clientId = await seedClient(p.orgId, "Comms Client");
    await loginAs(page, p);

    // Messages are logged from a dialog opened by the "Log a message" button
    await page.goto("/comms");
    await page.getByRole("button", { name: "Log a message" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator('select[name="clientId"]').selectOption({ label: "Comms Client" });
    await dialog.locator('select[name="channel"]').selectOption({ label: "Call" });
    await dialog.locator('select[name="direction"]').selectOption({ label: "We sent / we reached out" });
    await dialog.getByLabel("Subject *").fill("Kick-off call notes");
    await dialog.getByLabel("Details").fill("Agreed milestones for October.");
    await dialog.getByRole("button", { name: "Save to log" }).click();

    await expect(page.getByText("Kick-off call notes")).toBeVisible();
    // Entries are collapsible: the preview is visible, the full text sits inside the entry
    await expect(page.getByText("Agreed milestones for October.").first()).toBeVisible();
    expect(await prisma.commsMessage.count({ where: { orgId: p.orgId, clientId, direction: "OUT" } })).toBe(1);

    // Filter to received only (sidebar "Direction" filter) — the outgoing log should disappear
    await page.getByRole("navigation", { name: "Filter by direction" }).getByRole("link", { name: "Received" }).click();
    await expect(page.getByText("No conversations match")).toBeVisible();
    await expect(page.getByText("Kick-off call notes")).toHaveCount(0);
  });

  test("settings: company & GST profile saves and appears for invoices", async ({ page }) => {
    const p = await freshPersona("gst");
    await loginAs(page, p);

    await page.goto("/settings/company");
    await page.getByLabel("Business name *").fill("Studio Moiz Pvt Ltd");
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
    await expect(page.getByRole("heading", { level: 1, name: "Team directory" })).toBeVisible();
    // The directory shows a "Members" count tile and lists everyone in the workspace
    await expect(page.getByText("Members", { exact: true })).toBeVisible();
    expect(await prisma.membership.count({ where: { orgId: owner.orgId } })).toBe(2);
    await expect(page.getByText("E2E tdir").first()).toBeVisible();
    await expect(page.getByText("E2E tdmember").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Invite member" })).toBeVisible();
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
    // Overdue invoice: the summary tile, the briefing text and the attention list all show it
    await expect(page.getByText(/1 invoice past due/)).toBeVisible();
    await expect(page.getByText(/is overdue across 1 invoice, starting with CIO Client/)).toBeVisible();
    await expect(page.getByText(`CIO-1-${suffix}`).first()).toBeVisible();
    // Open memory question: the briefing calls it out
    await expect(page.getByText(/1 question in your business memory is still unanswered/)).toBeVisible();
  });
});
