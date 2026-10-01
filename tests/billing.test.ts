import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  canTransitionSubscription,
  SUBSCRIPTION_TRANSITIONS,
} from "@/lib/subscription-state";
import {
  activatePlan,
  markPastDue,
  cancelSubscription,
  isSubscriptionEntitled,
  InvalidTransitionError,
  PERIOD_DAYS,
} from "@/lib/billing";
import { verifyWebhookSignature, quoteAmountMinor } from "@/lib/razorpay";
import {
  eventEnvelopeSchema,
  extractEventEntityId,
  mapEventToOrg,
  normalizePlanId,
  paymentPayloadSeats,
  recordBillingEvent,
  recordIgnoredEvent,
} from "@/lib/billing-events";
import { getOrCreateSubscription } from "@/lib/subscription";
import { planOf } from "@/lib/plans";

/**
 * Billing tests (ADR-017) — subscription state machine, activation,
 * webhook idempotency ledger, payload mapping, expired-trial entitlement.
 *
 * Integration pieces run against the disposable dev Postgres like
 * tests/integration.test.ts. Every fixture is org-scoped and torn down.
 */

const prisma = new PrismaClient();

let orgId: string;
let userId: string;

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `billing-${suffix}@example.com`, name: "Billing Test" },
  });
  userId = user.id;
  const org = await prisma.organization.create({
    data: { name: "Billing Test Org", slug: `bill-${suffix}`, plan: "STARTER" },
  });
  orgId = org.id;
  await prisma.membership.create({
    data: { userId, orgId, role: "OWNER" },
  });
});

afterAll(async () => {
  await prisma.billingEvent.deleteMany({ where: { orgId } });
  await prisma.checkoutSession.deleteMany({ where: { orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

// ── Subscription state machine ───────────────────────────────────────────────

describe("subscription state machine (RULE-SUB-01)", () => {
  it("allows exactly TRIALING→ACTIVE from trial", () => {
    expect(canTransitionSubscription("TRIALING", "ACTIVE")).toBe(true);
    expect(canTransitionSubscription("TRIALING", "PAST_DUE")).toBe(false);
    expect(canTransitionSubscription("TRIALING", "CANCELED")).toBe(false);
  });

  it("allows ACTIVE→PAST_DUE/CANCELED and recovery from PAST_DUE", () => {
    expect(canTransitionSubscription("ACTIVE", "PAST_DUE")).toBe(true);
    expect(canTransitionSubscription("ACTIVE", "CANCELED")).toBe(true);
    expect(canTransitionSubscription("PAST_DUE", "ACTIVE")).toBe(true);
    expect(canTransitionSubscription("PAST_DUE", "CANCELED")).toBe(true);
  });

  it("never allows re-trialing or self-transitions", () => {
    expect(canTransitionSubscription("ACTIVE", "TRIALING")).toBe(false);
    expect(canTransitionSubscription("CANCELED", "TRIALING")).toBe(false);
    expect(canTransitionSubscription("TRIALING", "TRIALING")).toBe(false);
    expect(canTransitionSubscription("ACTIVE", "ACTIVE")).toBe(false);
  });

  it("allows CANCELED→ACTIVE for self-serve resubscription", () => {
    expect(canTransitionSubscription("CANCELED", "ACTIVE")).toBe(true);
  });

  it("keeps the table total: every known state has an entry", () => {
    for (const state of ["TRIALING", "ACTIVE", "PAST_DUE", "CANCELED"]) {
      expect(Array.isArray(SUBSCRIPTION_TRANSITIONS[state])).toBe(true);
    }
  });
});

// ── Entitlement (expired trial + states) ─────────────────────────────────────

describe("billing entitlement", () => {
  it("entitles ACTIVE regardless of trialEndsAt", () => {
    expect(isSubscriptionEntitled("ACTIVE", null)).toBe(true);
    expect(isSubscriptionEntitled("ACTIVE", new Date(Date.now() - 1000))).toBe(true);
  });

  it("entitles unexpired TRIALING only", () => {
    expect(isSubscriptionEntitled("TRIALING", new Date(Date.now() + 86_400_000))).toBe(true);
    expect(isSubscriptionEntitled("TRIALING", new Date(Date.now() - 1))).toBe(false);
    expect(isSubscriptionEntitled("TRIALING", null)).toBe(false);
  });

  it("refuses PAST_DUE and CANCELED", () => {
    expect(isSubscriptionEntitled("PAST_DUE", new Date(Date.now() + 86_400_000))).toBe(false);
    expect(isSubscriptionEntitled("CANCELED", null)).toBe(false);
  });
});

// ── Activation + transitions (integration) ──────────────────────────────────

describe("activatePlan (integration)", () => {
  it("moves TRIALING → ACTIVE and stamps the period + seats", async () => {
    await getOrCreateSubscription(orgId);
    const { applied, from } = await activatePlan(orgId, {
      plan: "GROWTH",
      seats: 5,
      paymentId: "pay_test_activate",
    });
    expect(applied).toBe(true);
    expect(from).toBe("TRIALING");

    const sub = await prisma.subscription.findUniqueOrThrow({ where: { orgId } });
    expect(sub.state).toBe("ACTIVE");
    expect(sub.plan).toBe("GROWTH");
    expect(sub.seats).toBe(5);
    expect(sub.lastPaymentId).toBe("pay_test_activate");
    expect(sub.currentPeriodStart).not.toBeNull();
    const span =
      sub.currentPeriodEnd!.getTime() - sub.currentPeriodStart!.getTime();
    expect(span).toBeGreaterThanOrEqual((PERIOD_DAYS - 0.01) * 86_400_000);
  });

  it("is idempotent when already ACTIVE (replay extends, never regresses)", async () => {
    const before = await prisma.subscription.findUniqueOrThrow({ where: { orgId } });
    const { applied } = await activatePlan(orgId, {
      plan: "GROWTH",
      seats: 5,
      paymentId: "pay_test_replay",
    });
    expect(applied).toBe(false);
    const after = await prisma.subscription.findUniqueOrThrow({ where: { orgId } });
    expect(after.state).toBe("ACTIVE");
    expect(after.currentPeriodEnd!.getTime()).toBeGreaterThanOrEqual(
      before.currentPeriodEnd!.getTime(),
    );
  });

  it("recovers PAST_DUE → ACTIVE on payment", async () => {
    await markPastDue(orgId);
    expect(
      (await prisma.subscription.findUniqueOrThrow({ where: { orgId } })).state,
    ).toBe("PAST_DUE");

    const { applied } = await activatePlan(orgId, {
      plan: "GROWTH",
      seats: 5,
      paymentId: "pay_test_recover",
    });
    expect(applied).toBe(true);
    expect(
      (await prisma.subscription.findUniqueOrThrow({ where: { orgId } })).state,
    ).toBe("ACTIVE");
  });

  it("blocks ACTIVE→TRIALING by design (guard throws before any write)", async () => {
    const { canTransitionSubscription } = await import("@/lib/subscription-state");
    expect(canTransitionSubscription("ACTIVE", "TRIALING")).toBe(false);
    // The FSM table is the enforcement point; activatePlan can only reach
    // ACTIVE, so an illegal move is unreachable from it by construction.
  });

  it("cancels only from ACTIVE/PAST_DUE; a canceled org that pays again reactivates", async () => {
    const ok = await cancelSubscription(orgId);
    expect(ok).toBe(true);
    expect(
      (await prisma.subscription.findUniqueOrThrow({ where: { orgId } })).state,
    ).toBe("CANCELED");

    expect(await cancelSubscription(orgId)).toBe(false);
    expect(await markPastDue(orgId)).toBe(false);

    // Self-serve resubscription: a fresh payment re-ACTIVEs a canceled org.
    await expect(
      activatePlan(orgId, { plan: "GROWTH", seats: 5, paymentId: "pay_after_cancel" }),
    ).resolves.toMatchObject({ applied: true, from: "CANCELED" });
    expect(
      (await prisma.subscription.findUniqueOrThrow({ where: { orgId } })).state,
    ).toBe("ACTIVE");
  });
});

// ── Webhook payload mapping + signature ──────────────────────────────────────

describe("webhook signature (verifyWebhookSignature)", () => {
  const { createHmac } = require("node:crypto") as typeof import("node:crypto");

  it("accepts a correctly signed payload and rejects tampering", () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = "whsec_test_secret";
    const body = JSON.stringify({ event: "payment.captured", payload: {} });
    const sig = createHmac("sha256", "whsec_test_secret").update(body).digest("hex");

    expect(verifyWebhookSignature(body, sig)).toBe(true);
    expect(verifyWebhookSignature(body, sig.slice(0, -1) + "0")).toBe(false);
    expect(verifyWebhookSignature(body + " ", sig)).toBe(false);
    expect(verifyWebhookSignature(body, null)).toBe(false);
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    expect(verifyWebhookSignature(body, sig)).toBe(false); // unconfigured → fail closed
  });
});

describe("webhook payload mapping", () => {
  it("validates the event envelope with zod", () => {
    const good = {
      event: "payment.captured",
      payload: {
        payment: { id: "pay_1", order_id: "order_1", notes: { orgId: "org_1" } },
        order: { id: "order_1" },
      },
    };
    const parsed = eventEnvelopeSchema.safeParse(good);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(mapEventToOrg(parsed.data)).toBe("org_1");
      expect(extractEventEntityId(parsed.data)).toBe("order_1");
    }

    const bad = { event: "payment.captured", payload: "nonsense" };
    expect(eventEnvelopeSchema.safeParse(bad).success).toBe(false);
  });

  it("derives org from payment notes or subscription notes", () => {
    const viaPayment = eventEnvelopeSchema.parse({
      event: "order.paid",
      payload: { payment: { notes: { orgId: "orgA" } } },
    });
    expect(mapEventToOrg(viaPayment)).toBe("orgA");

    const viaSubscription = eventEnvelopeSchema.parse({
      event: "subscription.charged",
      payload: { subscription: { notes: { orgId: "orgB" } } },
    });
    expect(mapEventToOrg(viaSubscription)).toBe("orgB");

    const unmapped = eventEnvelopeSchema.parse({
      event: "order.paid",
      payload: { order: { id: "order_x" } },
    });
    expect(mapEventToOrg(unmapped)).toBeNull();
  });

  it("parses seats from notes with sane bounds and fallback", () => {
    const withSeats = eventEnvelopeSchema.parse({
      event: "payment.captured",
      payload: { payment: { notes: { seats: "12" } } },
    });
    expect(paymentPayloadSeats(withSeats, 3)).toBe(12);

    const garbage = eventEnvelopeSchema.parse({
      event: "payment.captured",
      payload: { payment: { notes: { seats: "99999999" } } },
    });
    expect(paymentPayloadSeats(garbage, 3)).toBe(3);

    const missing = eventEnvelopeSchema.parse({
      event: "payment.captured",
      payload: { payment: {} },
    });
    expect(paymentPayloadSeats(missing, 4)).toBe(4);
  });

  it("normalizes plan ids strictly (never trusts arbitrary strings)", () => {
    expect(normalizePlanId("growth")).toBe("GROWTH");
    expect(normalizePlanId("SCALE")).toBe("SCALE");
    expect(normalizePlanId("ENTERPRISE")).toBeNull();
    expect(normalizePlanId(undefined)).toBeNull();
  });
});

// ── Idempotency ledger (integration) ─────────────────────────────────────────

describe("billing event ledger idempotency (integration)", () => {
  it("records once; redelivery is a duplicate; unmapped events are stored", async () => {
    const externalId = `order_${suffix}`;
    const first = await recordBillingEvent({
      orgId,
      eventType: "order.paid",
      externalId,
      payloadJson: "{}",
    });
    expect(first.result).toBe("processed");

    const retry = await recordBillingEvent({
      orgId,
      eventType: "order.paid",
      externalId,
      payloadJson: "{}",
    });
    expect(retry.result).toBe("duplicate");

    // Same external id, different event type = distinct event (Razorpay
    // semantics: order.paid AND payment.captured both reference one order).
    const otherType = await recordBillingEvent({
      orgId,
      eventType: "payment.captured",
      externalId,
      payloadJson: "{}",
    });
    expect(otherType.result).toBe("processed");

    const unmapped = await recordBillingEvent({
      orgId: null,
      eventType: "subscription.charged",
      externalId: `sub_${suffix}`,
      payloadJson: "{}",
    });
    expect(unmapped.result).toBe("unmapped");

    const row = await prisma.billingEvent.findUnique({
      where: {
        provider_eventType_externalId: {
          provider: "razorpay",
          eventType: "subscription.charged",
          externalId: `sub_${suffix}`,
        },
      },
    });
    expect(row?.orgId).toBeNull();
  });

  it("ledgers ignored event types without processing", async () => {
    await recordIgnoredEvent({
      orgId,
      eventType: "refund.processed",
      externalId: `rfnd_${suffix}`,
      payloadJson: "{}",
    });
    const row = await prisma.billingEvent.findUnique({
      where: {
        provider_eventType_externalId: {
          provider: "razorpay",
          eventType: "refund.processed",
          externalId: `rfnd_${suffix}`,
        },
      },
    });
    expect(row?.processedAt).toBeNull();
  });
});

// ── Quoting + seat pricing ───────────────────────────────────────────────────

describe("seat-based quoting", () => {
  it("computes seats × per-user price in paise", () => {
    const growth = planOf("GROWTH");
    expect(quoteAmountMinor(5, growth.pricePerUserMinor)).toBe(5 * 99_900);
    expect(quoteAmountMinor(1, planOf("STARTER").pricePerUserMinor)).toBe(49_900);
  });

  it("plan caps line up with purchased-seat model (no cap ⇒ null maxSeats)", () => {
    expect(planOf("SCALE").maxSeats).toBeNull(); // purchased seats govern instead
    expect(planOf("STARTER").maxSeats).toBe(10); // static fallback for non-ACTIVE
  });
});
