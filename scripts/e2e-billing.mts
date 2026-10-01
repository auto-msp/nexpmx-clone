/**
 * E2E verification for the billing webhook path (ADR-017).
 *
 * Runs against a live server (npm run start) with RAZORPAY_WEBHOOK_SECRET
 * set on BOTH the server process and this script:
 *
 *   RAZORPAY_WEBHOOK_SECRET=e2e-whsec npx tsx scripts/e2e-billing.mts
 *
 *   1. creates a real org with a TRIALING subscription + a CREATED
 *      CheckoutSession (as beginCheckout would),
 *   2. POSTs a correctly signed payment.captured webhook,
 *   3. asserts TRIALING → ACTIVE, checkout COMPLETED, org plan updated,
 *   4. POSTs the SAME event again (Razorpay at-least-once redelivery)
 *      and asserts exactly-once effects (period not re-extended, audit
 *      event written once),
 *   5. asserts an UNSIGNED webhook is rejected (400) and touches nothing,
 *   6. asserts a signed event with no mappable org is accepted (200) but
 *      applied to nothing,
 *   7. cleans up every row.
 *
 * Usage: server must be running with the same webhook secret.
 */
import { PrismaClient } from "@prisma/client";
import { createHmac, randomBytes } from "node:crypto";

// Mirror prisma.config.ts / vitest.config.ts: real env wins over .env.
try {
  const raw = (await import("node:fs")).readFileSync(".env", "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    const value = m[2].replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
} catch {}

const prisma = new PrismaClient();
const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const SECRET = process.env.RAZORPAY_WEBHOOK_SECRET ?? "e2e-whsec";
process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    failures++;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function signed(body: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Razorpay-Signature": createHmac("sha256", SECRET).update(body).digest("hex"),
  };
}

const suffix = randomBytes(4).toString("hex");
const stamp = Date.now();
const orderId = `order_e2e_${suffix}`;
const paymentId = `pay_e2e_${suffix}`;

// ── Fixtures: org in TRIALING with a CREATED checkout ────────────────────────
const user = await prisma.user.create({
  data: { email: `e2e-bill-${stamp}-${suffix}@example.com`, name: "E2E Billing" },
});
const org = await prisma.organization.create({
  data: { name: "E2E Billing Org", slug: `e2e-bill-${suffix}`, plan: "STARTER" },
});
await prisma.membership.create({ data: { userId: user.id, orgId: org.id, role: "OWNER" } });
const sub = await prisma.subscription.create({
  data: {
    orgId: org.id,
    state: "TRIALING",
    plan: "STARTER",
    trialEndsAt: new Date(Date.now() + 14 * 86_400_000),
  },
});
await prisma.checkoutSession.create({
  data: {
    orgId: org.id,
    subscriptionId: sub.id,
    plan: "GROWTH",
    seats: 4,
    amountMinor: 4 * 99_900,
    razorpayOrderId: orderId,
    state: "CREATED",
  },
});

const webhookEvent = {
  event: "payment.captured",
  payload: {
    payment: {
      id: paymentId,
      order_id: orderId,
      status: "captured",
      notes: { orgId: org.id, plan: "GROWTH", seats: "4" },
    },
    order: { id: orderId },
  },
};

const rawBody = JSON.stringify(webhookEvent);

try {
  console.log("Billing webhook e2e:");

  // 1. Unsigned request must be rejected before anything is touched.
  {
    const res = await fetch(`${BASE}/api/webhooks/razorpay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: rawBody,
    });
    check("unsigned webhook → 400", res.status === 400, String(res.status));
    const stillTrialing = await prisma.subscription.findUnique({ where: { orgId: org.id } });
    check(
      "unsigned webhook changed nothing",
      stillTrialing?.state === "TRIALING",
      stillTrialing?.state,
    );
  }

  // 2. Signed event with no mappable org: accepted, stored, not applied.
  {
    const unmapped = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { id: `pay_orphan_${suffix}`, order_id: `order_orphan_${suffix}` } },
    });
    const res = await fetch(`${BASE}/api/webhooks/razorpay`, {
      method: "POST",
      headers: signed(unmapped),
      body: unmapped,
    });
    const json = (await res.json()) as { result?: string };
    check("unmapped signed event → 200 unmapped", res.status === 200 && json.result === "unmapped", `${res.status} ${json.result}`);
  }

  // 3. The real activation event.
  {
    const res = await fetch(`${BASE}/api/webhooks/razorpay`, {
      method: "POST",
      headers: signed(rawBody),
      body: rawBody,
    });
    const json = (await res.json()) as { result?: string };
    check("signed payment.captured → 200 processed", res.status === 200 && json.result === "processed", `${res.status} ${json.result}`);

    const after = await prisma.subscription.findUnique({ where: { orgId: org.id } });
    check("TRIALING → ACTIVE", after?.state === "ACTIVE", after?.state);
    check("plan set from checkout row (GROWTH)", after?.plan === "GROWTH", after?.plan);
    check("seats recorded (4)", after?.seats === 4, String(after?.seats));
    check("period stamped", after?.currentPeriodEnd !== null && after?.lastPaymentId === paymentId);
    check(
      "period length ≥ 30d",
      after?.currentPeriodEnd !== null &&
        after?.currentPeriodEnd!.getTime() - after?.currentPeriodStart!.getTime() >=
          (30 - 0.01) * 86_400_000,
    );

    const checkout = await prisma.checkoutSession.findUnique({ where: { razorpayOrderId: orderId } });
    check("checkout completed", checkout?.state === "COMPLETED", checkout?.state);

    const orgRow = await prisma.organization.findUnique({ where: { id: org.id } });
    check("organization.plan synced (GROWTH)", orgRow?.plan === "GROWTH", orgRow?.plan);

    const activated = await prisma.auditLog.findFirst({
      where: { orgId: org.id, action: "billing.subscription_activated" },
    });
    check("audit event written", activated !== null);

    // Entitlement now open (the gate the app uses).
    const { isSubscriptionEntitled } = await import("../src/lib/billing");
    check("org entitled after activation", isSubscriptionEntitled(after!.state, after!.trialEndsAt));
  }

  // 4. Redelivery of the SAME event: exactly-once effects.
  {
    const before = await prisma.subscription.findUnique({ where: { orgId: org.id } });
    const auditsBefore = await prisma.auditLog.count({
      where: { orgId: org.id, action: "billing.subscription_activated" },
    });
    const res = await fetch(`${BASE}/api/webhooks/razorpay`, {
      method: "POST",
      headers: signed(rawBody),
      body: rawBody,
    });
    const json = (await res.json()) as { result?: string };
    check("redelivery → 200 duplicate", res.status === 200 && json.result === "duplicate", `${res.status} ${json.result}`);
    const after = await prisma.subscription.findUnique({ where: { orgId: org.id } });
    check(
      "redelivery did not re-extend the period",
      after?.currentPeriodEnd!.getTime() === before?.currentPeriodEnd!.getTime(),
    );
    check(
      "redelivery wrote no second activation audit",
      (await prisma.auditLog.count({
        where: { orgId: org.id, action: "billing.subscription_activated" },
      })) === auditsBefore,
    );
  }

  // 5. Malformed JSON with a VALID signature → 400 (zod/body gate).
  {
    const garbage = "not json at all";
    const res = await fetch(`${BASE}/api/webhooks/razorpay`, {
      method: "POST",
      headers: signed(garbage),
      body: garbage,
    });
    check("signed garbage → 400", res.status === 400, String(res.status));
  }
} finally {
  // ── Cleanup ──────────────────────────────────────────────────────────────
  await prisma.billingEvent.deleteMany({ where: { orgId: org.id } });
  await prisma.auditLog.deleteMany({ where: { orgId: org.id } });
  await prisma.checkoutSession.deleteMany({ where: { orgId: org.id } });
  await prisma.subscription.deleteMany({ where: { orgId: org.id } });
  await prisma.organization.delete({ where: { id: org.id } });
  await prisma.user.delete({ where: { id: user.id } });
  await prisma.$disconnect();
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nAll billing webhook e2e checks passed.");
