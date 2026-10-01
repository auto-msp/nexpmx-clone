import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { verifyWebhookSignature } from "@/lib/razorpay";
import { getOrCreateSubscription } from "@/lib/subscription";
import { activatePlan, markPastDue } from "@/lib/billing";
import {
  eventEnvelopeSchema,
  extractEventEntityId,
  mapEventToOrg,
  normalizePlanId,
  paymentPayloadSeats,
  recordBillingEvent,
  recordIgnoredEvent,
  HANDLED_EVENTS,
} from "@/lib/billing-events";

/**
 * Razorpay webhook receiver (ADR-017).
 *
 * Contract:
 * - Signature first: HMAC-SHA256 over the RAW body with
 *   RAZORPAY_WEBHOOK_SECRET, constant-time compared. Unsigned or forged
 *   requests get 400 and touch nothing.
 * - Malformed payloads (zod) → 400; the provider retries, which is correct.
 * - Idempotency: BillingEvent (provider, eventType, externalId) UNIQUE —
 *   redeliveries return 200 "duplicate" and change nothing.
 * - Organization mapping via the notes stamped on the order at creation;
 *   unmapped events are stored (orgId null) and 200-acknowledged for ops
 *   reconciliation — never applied.
 * - Out-of-order tolerance: activations extend periods (never regress) and
 *   state moves go through the explicit transition table.
 * - Meaningful state changes are audited with metadata only (ids, plan,
 *   seats) — no payload dumps, no secrets.
 */

// Next.js route handlers must see the raw body for signature verification.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return NextResponse.json({ error: "Unreadable body" }, { status: 400 });
  }

  const signature = req.headers.get("x-razorpay-signature");
  if (!verifyWebhookSignature(raw, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = eventEnvelopeSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Malformed event" }, { status: 400 });
  }
  const envelope = parsed.data;
  const eventType = envelope.event;

  const externalId = extractEventEntityId(envelope);
  if (!externalId) {
    return NextResponse.json({ error: "Event missing entity id" }, { status: 400 });
  }

  const eventOrgId = mapEventToOrg(envelope);

  // Find our order → checkout session (authoritative plan/seats/amount).
  const orderId =
    envelope.payload.payment?.order_id ?? envelope.payload.order?.id ?? null;
  let checkout = null;
  if (orderId) {
    checkout = await prisma.checkoutSession.findUnique({
      where: { razorpayOrderId: orderId },
    });
  }

  if (!HANDLED_EVENTS.includes(eventType as (typeof HANDLED_EVENTS)[number])) {
    // Ledger + 200 so Razorpay does not retry forever on events we ignore.
    await recordIgnoredEvent({
      orgId: eventOrgId,
      eventType,
      externalId,
      payloadJson: raw,
    });
    return NextResponse.json({ received: true, result: "ignored" });
  }

  // Idempotency gate — insert ledger row first; duplicates stop here.
  const outcome = await recordBillingEvent({
    orgId: eventOrgId,
    eventType,
    externalId,
    payloadJson: raw,
  });
  if (outcome.result !== "processed") {
    // duplicate → redelivery of a processed event; unmapped → no org could
    // be derived (stored for ops); ignored → defensive, never returned here.
    return NextResponse.json({ received: true, result: outcome.result });
  }
  const orgId: string = outcome.orgId; // narrowed: processed ⇒ non-null

  // ── Event application (orgId known) ─────────────────────────────────────

  await getOrCreateSubscription(orgId); // bootstrap must exist before transitions

  const paymentId = envelope.payload.payment?.id ?? externalId;

  const sub = await prisma.subscription.findUnique({ where: { orgId } });
  if (!sub) {
    return NextResponse.json({ error: "Subscription missing" }, { status: 500 });
  }

  if (
    eventType === "payment.captured" ||
    eventType === "order.paid" ||
    eventType === "subscription.charged" ||
    eventType === "subscription.activated"
  ) {

    // Authoritative plan: the checkout row we created server-side; notes as
    // fallback; never any client-declared value. Narrowed to the Plan enum
    // (normalizePlanId validates membership before casting).
    const planId =
      normalizePlanId(checkout?.plan) ??
      normalizePlanId(envelope.payload.payment?.notes?.plan) ??
      normalizePlanId(envelope.payload.subscription?.notes?.plan) ??
      (sub.plan as string);
    const seats = checkout?.seats ?? paymentPayloadSeats(envelope, sub.seats ?? 1);

    const { applied, from } = await activatePlan(orgId, {
      plan: planId as "STARTER" | "GROWTH" | "SCALE",
      seats,
      paymentId,
      providerSubscriptionId: envelope.payload.subscription?.id ?? undefined,
    });

    // Complete the checkout row exactly once.
    if (checkout && checkout.state === "CREATED") {
      await prisma.checkoutSession.update({
        where: { id: checkout.id },
        data: { state: "COMPLETED", completedAt: new Date() },
      });
    }

    // Keep Organization.plan in sync (entitlement reads use it).
    await prisma.organization.update({
      where: { id: orgId },
      data: { plan: planId as "STARTER" | "GROWTH" | "SCALE" },
    });

    await audit({
      orgId,
      action: applied ? "billing.subscription_activated" : "billing.subscription_renewed",
      entity: "Subscription",
      entityId: sub.id,
      meta: { event: eventType, plan: planId, seats, from, paymentId },
    });
  }

  if (eventType === "payment.failed") {
    const changed = await markPastDue(orgId);
    await audit({
      orgId,
      action: "billing.payment_failed",
      entity: "Subscription",
      entityId: sub.id,
      meta: { event: eventType, applied: changed, paymentId },
    });
  }

  return NextResponse.json({ received: true, result: "processed" });
}
