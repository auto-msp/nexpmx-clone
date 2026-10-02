/**
 * E2E — billing surface and webhook activation (ADR-017).
 *
 * Without RAZORPAY_KEY_ID/KEY_SECRET the app boots in contact-us mode by
 * design, so this spec verifies:
 *  1. the /billing page renders plans + seat picker + contact-us CTA,
 *  2. the expired-trial gate links to /billing (RULE-ENT-04),
 *  3. a MEMBER (non-owner) cannot manage billing,
 *  4. signed webhook activation over live HTTP flips TRIALING → ACTIVE and
 *     the workspace reopens (the full revenue path, no browser involved),
 *  5. redelivery of the same event is exactly-once.
 *
 * The Razorpay widget itself (real payment) is out of scope without live
 * keys; scripts/e2e-billing.mts covers the webhook contract in more depth.
 */
import { test, expect } from "@playwright/test";
import {
  seedPersona,
  seedMemberOf,
  loginAs,
  teardownPersona,
  signedWebhookHeaders,
  prisma,
  type TestOrg,
} from "./helpers";

let owner: TestOrg;
let expired: TestOrg;

test.beforeAll(async () => {
  owner = await seedPersona("billing", { state: "TRIALING", daysToTrialEnd: 10 });
  expired = await seedPersona("expired", { state: "TRIALING", daysToTrialEnd: -1 });
});

test.afterAll(async () => {
  await teardownPersona(owner);
  await teardownPersona(expired);
});

test("/billing renders plans, seat picker, and contact-us CTA without keys", async ({ page }) => {
  await loginAs(page, owner);
  await page.goto("/billing");
  await expect(page.getByRole("heading", { name: /plans & billing/i })).toBeVisible();

  for (const planName of ["Starter", "Growth", "Scale"]) {
    await expect(page.getByRole("button", { name: new RegExp(planName) })).toBeVisible();
  }
  await expect(page.getByLabel("Seats (users)")).toBeVisible();
  // billingReady=false → the deterministic no-keys CTA.
  await expect(page.getByRole("button", { name: /contact us to activate/i })).toBeVisible();
  // Server-side quote is visible: 1 seat × ₹499 Starter default.
  await expect(page.getByText(/total:/i)).toBeVisible();
});

test("expired-trial org sees the gate, not app routes; gate links to /billing", async ({ page }) => {
  await loginAs(page, expired);
  await page.goto("/overview");
  await expect(page.getByText(/your trial has ended/i)).toBeVisible();
  // App routes are replaced — no client data surfaces.
  await expect(page.getByText("E2E Invoice Client")).toHaveCount(0);

  await page.getByRole("link", { name: /choose a plan & reactivate/i }).click();
  await expect(page).toHaveURL(/\/billing$/);
  await expect(page.getByRole("heading", { name: /plans & billing/i })).toBeVisible();
});

test("MEMBER (non-owner) cannot manage billing", async ({ page }) => {
  // Single-MEMBERSHIP persona: getOrgContext resolves to the owner's org.
  const member = await seedMemberOf(owner.orgId, "billing-member");
  try {
    await loginAs(page, member);
    await page.goto("/billing");
    await expect(
      page.getByText(/only the workspace owner can change the plan/i),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /contact us to activate/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /continue to payment/i })).toHaveCount(0);
  } finally {
    await prisma.membership.deleteMany({
      where: { userId: member.userId, orgId: owner.orgId },
    });
    await prisma.session.deleteMany({ where: { userId: member.userId } });
    await prisma.user.deleteMany({ where: { id: member.userId } });
  }
});

test("webhook activation reopens the expired workspace end-to-end", async ({ request }) => {
  const suffix = Date.now().toString(36);
  const orderId = `order_e2e_pw_${suffix}`;
  const paymentId = `pay_e2e_pw_${suffix}`;

  const body = JSON.stringify({
    event: "payment.captured",
    payload: {
      payment: {
        id: paymentId,
        order_id: orderId,
        status: "captured",
        notes: { orgId: expired.orgId, plan: "GROWTH", seats: "3" },
      },
      order: { id: orderId },
    },
  });

  const res = await request.post("/api/webhooks/razorpay", {
    headers: signedWebhookHeaders(body),
    data: body,
  });
  expect(res.status()).toBe(200);
  expect(((await res.json()) as { result?: string }).result).toBe("processed");

  const sub = await prisma.subscription.findUnique({ where: { orgId: expired.orgId } });
  expect(sub?.state).toBe("ACTIVE");
  expect(sub?.plan).toBe("GROWTH");
  expect(sub?.seats).toBe(3);

  const orgRow = await prisma.organization.findUnique({ where: { id: expired.orgId } });
  expect(orgRow?.plan).toBe("GROWTH");

});

test("expired org can use the app after activation", async ({ page }) => {
  // Continuation of the previous test (worker = 1, file order guaranteed):
  // expired was activated by the webhook in the prior test.
  await loginAs(page, expired);
  await page.goto("/overview");
  await expect(page.getByRole("heading", { name: /growth plan overview/i })).toBeVisible();
  await expect(page.getByText(/your trial has ended/i)).toHaveCount(0);
});

test("webhook redelivery is exactly-once", async ({ request }) => {
  const suffix = Date.now().toString(36);
  const orderId = `order_e2e_pw2_${suffix}`;
  const paymentId = `pay_e2e_pw2_${suffix}`;
  const body = JSON.stringify({
    event: "payment.captured",
    payload: {
      payment: {
        id: paymentId,
        order_id: orderId,
        status: "captured",
        notes: { orgId: expired.orgId, plan: "GROWTH", seats: "3" },
      },
      order: { id: orderId },
    },
  });
  const headers = signedWebhookHeaders(body);
  const first = await request.post("/api/webhooks/razorpay", { headers, data: body });
  expect(first.status()).toBe(200);

  const before = await prisma.subscription.findUnique({ where: { orgId: expired.orgId } });
  const auditsBefore = await prisma.auditLog.count({
    where: { orgId: expired.orgId, action: "billing.subscription_renewed" },
  });

  const second = await request.post("/api/webhooks/razorpay", { headers, data: body });
  expect(second.status()).toBe(200);
  expect(((await second.json()) as { result?: string }).result).toBe("duplicate");

  const after = await prisma.subscription.findUnique({ where: { orgId: expired.orgId } });
  expect(after?.currentPeriodEnd?.getTime()).toBe(before?.currentPeriodEnd?.getTime());
  expect(
    await prisma.auditLog.count({
      where: { orgId: expired.orgId, action: "billing.subscription_renewed" },
    }),
  ).toBe(auditsBefore);
});

test("unsigned webhook is rejected and changes nothing", async ({ request }) => {
  const body = JSON.stringify({
    event: "payment.captured",
    payload: {
      payment: { id: "pay_forge", order_id: "order_forge", notes: { orgId: expired.orgId } },
      order: { id: "order_forge" },
    },
  });
  const res = await request.post("/api/webhooks/razorpay", {
    headers: { "Content-Type": "application/json" },
    data: body,
  });
  expect(res.status()).toBe(400);
  const sub = await prisma.subscription.findUnique({ where: { orgId: expired.orgId } });
  expect(sub?.state).toBe("ACTIVE"); // untouched by the forged event
});
