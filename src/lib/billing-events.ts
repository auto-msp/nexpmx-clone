import { prisma } from "@/lib/db";
import { z } from "zod";
import { audit } from "@/lib/audit";

/**
 * Webhook event ledger + payload mapping (ADR-017).
 *
 * Idempotency model: (provider, eventType, externalId) is UNIQUE in the
 * BillingEvent table. The route inserts the ledger row INSIDE the same
 * transaction as the subscription mutation, so Razorpay's at-least-once
 * redelivery finds an existing row and replays "already processed" — no
 * duplicate invoices, no double activation, no double audit.
 *
 * Events that cannot be mapped to an org are still stored (orgId null) so
 * operators can reconcile misconfigured dashboards; they are never applied.
 *
 * Out-of-order safety: activations are period-extends (never regress), and
 * state moves go through the explicit transition table, so a stale delivery
 * can only extend a period, not downgrade a state.
 */

export const BILLING_PROVIDER = "razorpay";

/** Events we act on; everything else is acknowledged and ledgered only. */
export const HANDLED_EVENTS = [
  "payment.captured",
  "order.paid",
  "subscription.charged",
  "subscription.activated",
  "payment.failed",
] as const;

/** The order id and (optional) payment id carried by every event we handle. */
export const eventEnvelopeSchema = z.object({
  event: z.string().min(1),
  payload: z.object({
    order: z
      .object({ id: z.string().min(1).optional() })
      .optional(),
    payment: z
      .object({
        id: z.string().min(1).optional(),
        order_id: z.string().min(1).optional(),
        status: z.string().optional(),
        notes: z.record(z.string()).optional(),
      })
      .optional(),
    subscription: z
      .object({
        id: z.string().min(1).optional(),
        notes: z.record(z.string()).optional(),
      })
      .optional(),
  }),
});

export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;

/** Choose the ledger dedup id for an event (order id preferred, else payment/subscription id). */
export function extractEventEntityId(envelope: EventEnvelope): string | null {
  return (
    envelope.payload.order?.id ??
    envelope.payload.payment?.id ??
    envelope.payload.subscription?.id ??
    null
  );
}

/** Our orgId, from the notes we stamped on the order at creation time. */
export function mapEventToOrg(envelope: EventEnvelope): string | null {
  return (
    envelope.payload.payment?.notes?.orgId ??
    envelope.payload.subscription?.notes?.orgId ??
    null
  );
}

/** Seats from the notes stamped at order creation (fallback: current seats). */
export function paymentPayloadSeats(
  envelope: EventEnvelope,
  fallbackSeats: number,
): number {
  const raw =
    envelope.payload.payment?.notes?.seats ??
    envelope.payload.subscription?.notes?.seats;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 10_000
    ? parsed
    : fallbackSeats;
}

const PLAN_IDS = ["STARTER", "GROWTH", "SCALE"] as const;

/** Plan from notes, or the order-linked checkout row; never from the browser. */
export function normalizePlanId(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const upper = raw.toUpperCase();
  return (PLAN_IDS as readonly string[]).includes(upper) ? upper : null;
}

export type BillingEventOutcome =
  | { result: "processed"; orgId: string }
  | { result: "duplicate"; orgId: string | null }
  | { result: "unmapped"; orgId: null }
  | { result: "ignored"; orgId: string | null };

/**
 * Record the event exactly once. Returns "duplicate" when this
 * (provider, eventType, externalId) was already processed — the caller then
 * replays nothing. Runs in its own transaction so the unique constraint is
 * the dedup authority (racing deliveries: one wins, others see P2002 here).
 */
export async function recordBillingEvent(input: {
  orgId: string | null;
  eventType: string;
  externalId: string;
  payloadJson: string;
}): Promise<BillingEventOutcome> {
  try {
    await prisma.billingEvent.create({
      data: {
        orgId: input.orgId,
        provider: BILLING_PROVIDER,
        eventType: input.eventType,
        externalId: input.externalId,
        payloadJson: input.payloadJson,
        processedAt: new Date(),
      },
    });
  } catch (err) {
    if ((err as { code?: string })?.code === "P2002") {
      const existing = await prisma.billingEvent.findUnique({
        where: {
          provider_eventType_externalId: {
            provider: BILLING_PROVIDER,
            eventType: input.eventType,
            externalId: input.externalId,
          },
        },
        select: { orgId: true },
      });
      return { result: "duplicate", orgId: existing?.orgId ?? null };
    }
    throw err;
  }
  if (!input.orgId) return { result: "unmapped", orgId: null };
  return { result: "processed", orgId: input.orgId };
}

/** Ledger-only write for events outside our handled set (still audited). */
export async function recordIgnoredEvent(input: {
  orgId: string | null;
  eventType: string;
  externalId: string;
  payloadJson: string;
}): Promise<void> {
  await prisma.billingEvent.create({
    data: {
      orgId: input.orgId,
      provider: BILLING_PROVIDER,
      eventType: input.eventType,
      externalId: input.externalId,
      payloadJson: input.payloadJson,
      processedAt: null,
    },
  });
  if (input.orgId) {
    await audit({
      orgId: input.orgId,
      action: "billing.event_ignored",
      entity: "BillingEvent",
      entityId: input.externalId,
      meta: { eventType: input.eventType },
    });
  }
}
