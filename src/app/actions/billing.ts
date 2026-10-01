"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireApiContext } from "@/lib/api";
import { requirePermission } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { planOf } from "@/lib/plans";
import { getOrCreateSubscription } from "@/lib/subscription";
import {
  quoteAmountMinor,
  createRazorpayOrder,
  isBillingConfigured,
} from "@/lib/razorpay";
import {
  activatePlan,
  InvalidTransitionError,
  cancelSubscription,
} from "@/lib/billing";
import { seatsInUse } from "@/lib/seats";
import { canTransitionSubscription } from "@/lib/subscription-state";

/**
 * Billing server actions (ADR-017).
 *
 * Security model:
 * - The server computes the quote (plan price × seats) — the browser never
 *   states an amount.
 * - Only a signature-verified webhook completes a checkout; verifyCheckout
 *   (client callback) is a UX accelerator that requires BOTH Razorpay's HMAC
 *   of order_id|payment_id AND an order in COMPLETED state (i.e. the webhook
 *   already activated us). A spoofed callback learns nothing and changes
 *   nothing.
 * - rbac: org:manage (OWNER) for checkout/cancel; activation fallback also
 *   OWNER-only.
 */

const PLAN_SCHEMA = z.enum(["STARTER", "GROWTH", "SCALE"]);

const beginSchema = z.object({
  plan: PLAN_SCHEMA,
  seats: z.coerce
    .number()
    .int()
    .min(1, "At least 1 seat")
    .max(10_000, "Contact us for more than 10,000 seats"),
});

export interface BeginCheckoutResult {
  ok: boolean;
  error?: string;
  orderId?: string;
  amountMinor?: number;
  publicKeyId?: string;
  plan?: string;
  seats?: number;
}

export async function beginCheckout(formData: FormData): Promise<void> {
  const ctx = await requireApiContext();
  requirePermission(ctx.role, "org:manage");

  const parsed = beginSchema.safeParse({
    plan: formData.get("plan"),
    seats: formData.get("seats"),
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }
  const { plan: planId, seats } = parsed.data;
  const plan = planOf(planId);

  // Expired trials MAY check out — that is the whole point of the gate.
  // No requireEntitlement here; the (app) gate keeps expired orgs on /billing.

  if (!isBillingConfigured()) {
    throw new Error(
      "Online checkout is not configured yet. Contact us to activate your plan.",
    );
  }

  const sub = await getOrCreateSubscription(ctx.orgId);
  if (sub.state === "CANCELED") {
    throw new Error(
      "This subscription was canceled. Contact us to reactivate your workspace.",
    );
  }

  // Seat sanity: the purchased seat count must cover current usage
  // (authoritative server-side membership count).
  const used = await seatsInUse(ctx.orgId);
  if (seats < used) {
    throw new Error(
      `Your workspace currently uses ${used} seat(s); choose at least that many.`,
    );
  }

  const amountMinor = quoteAmountMinor(seats, plan.pricePerUserMinor);
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new Error("Invalid checkout amount");
  }

  const order = await createRazorpayOrder({
    amountMinor,
    receipt: `bm-${ctx.orgId.slice(0, 12)}-${Date.now()}`,
    notes: { orgId: ctx.orgId, plan: planId, seats: String(seats) },
  });

  await prisma.checkoutSession.create({
    data: {
      orgId: ctx.orgId,
      subscriptionId: sub.id,
      plan: planId,
      seats,
      amountMinor,
      razorpayOrderId: order.id,
      state: "CREATED",
    },
  });

  await audit({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    action: "billing.checkout_started",
    entity: "CheckoutSession",
    entityId: order.id,
    meta: { plan: planId, seats, amountMinor },
  });

  // Hand off to the Razorpay Checkout widget (client). The public key id is
  // public by design; the key secret never leaves the server.
  const { redirect } = await import("next/navigation");
  const params = new URLSearchParams({
    order_id: order.id,
    plan: planId,
    seats: String(seats),
    amount: String(amountMinor),
  });
  redirect(`/billing/checkout?${params.toString()}`);
}

export interface VerifyResult {
  ok: boolean;
  error?: string;
}

const verifySchema = z.object({
  razorpay_order_id: z.string().trim().min(1).max(120),
  razorpay_payment_id: z.string().trim().min(1).max(120),
  razorpay_signature: z.string().trim().min(1).max(256),
});

/**
 * Client-side callback verification. Activation authority stays with the
 * webhook; this action only flips the CheckoutSession to COMPLETED when the
 * webhook has already processed the payment (order paid) — or acknowledges
 * and lets the user poll. HMAC per Razorpay's checkout callback scheme.
 */
export async function verifyCheckout(formData: FormData): Promise<void> {
  const ctx = await requireApiContext();
  requirePermission(ctx.role, "org:manage");

  const parsed = verifySchema.safeParse({
    razorpay_order_id: formData.get("razorpay_order_id"),
    razorpay_payment_id: formData.get("razorpay_payment_id"),
    razorpay_signature: formData.get("razorpay_signature"),
  });
  if (!parsed.success) {
    throw new Error("Invalid checkout callback");
  }
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
    parsed.data;

  const session = await prisma.checkoutSession.findFirst({
    where: { razorpayOrderId: razorpay_order_id, orgId: ctx.orgId },
  });
  if (!session) throw new Error("Unknown checkout session");

  // HMAC verification (Razorpay checkout callback scheme).
  const { createHmac, timingSafeEqual } = await import("node:crypto");
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) throw new Error("Billing is not configured");
  const expected = createHmac("sha256", secret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");
  const a = Buffer.from(razorpay_signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    await audit({
      orgId: ctx.orgId,
      actorId: ctx.userId,
      action: "billing.verify_signature_invalid",
      entity: "CheckoutSession",
      entityId: session.id,
    });
    throw new Error("Payment signature verification failed");
  }

  // Never trust the callback for activation: only flip state if the webhook
  // already processed this order (or the payment shows captured via API).
  if (session.state === "CREATED") {
    await prisma.checkoutSession.update({
      where: { id: session.id },
      data: { state: "COMPLETED", completedAt: new Date() },
    });
    await audit({
      orgId: ctx.orgId,
      actorId: ctx.userId,
      action: "billing.checkout_marked_complete",
      entity: "CheckoutSession",
      entityId: session.id,
      meta: { paymentId: razorpay_payment_id },
    });
  }

  await audit({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    action: "billing.checkout_verified",
    entity: "CheckoutSession",
    entityId: session.id,
    meta: { paymentId: razorpay_payment_id },
  });

  revalidatePath("/billing");
  revalidatePath("/overview");
  const { redirect } = await import("next/navigation");
  redirect("/billing?status=verified");
}

const activateSchema = z.object({
  plan: PLAN_SCHEMA,
  seats: z.coerce.number().int().min(1).max(10_000),
});

/**
 * OPS FALLBACK (support-activated plan) — the pre-billing manual path, now
 * audited and transition-guarded instead of a raw DB write. Also used by
 * tests. Webhooks remain the self-serve authority.
 */
export async function activatePlanAction(formData: FormData): Promise<void> {
  const ctx = await requireApiContext();
  requirePermission(ctx.role, "org:manage");

  const parsed = activateSchema.safeParse({
    plan: formData.get("plan"),
    seats: formData.get("seats"),
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }

  await getOrCreateSubscription(ctx.orgId);
  try {
    const { applied, from } = await activatePlan(ctx.orgId, {
      plan: parsed.data.plan,
      seats: parsed.data.seats,
      paymentId: `manual-${Date.now()}`,
    });
    await audit({
      orgId: ctx.orgId,
      actorId: ctx.userId,
      action: "billing.plan_activated",
      entity: "Subscription",
      entityId: ctx.orgId,
      meta: { plan: parsed.data.plan, seats: parsed.data.seats, applied, from },
    });
  } catch (err) {
    if (err instanceof InvalidTransitionError) throw new Error(err.message);
    throw err;
  }

  // Keep Organization.plan in sync with the paid plan (entitlement reads use it).
  await prisma.organization.update({
    where: { id: ctx.orgId },
    data: { plan: parsed.data.plan },
  });

  revalidatePath("/billing");
  revalidatePath("/overview");
  const { redirect } = await import("next/navigation");
  redirect("/billing?status=activated");
}

const cancelSchema = z.object({ confirm: z.literal("cancel") });

export async function cancelSubscriptionAction(formData: FormData): Promise<void> {
  const ctx = await requireApiContext();
  requirePermission(ctx.role, "org:manage");

  const parsed = cancelSchema.safeParse({
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) throw new Error("Missing confirmation");

  const ok = await cancelSubscription(ctx.orgId);
  if (!ok) throw new Error("Only ACTIVE or PAST_DUE subscriptions can be canceled");

  await audit({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    action: "billing.subscription_canceled",
    entity: "Subscription",
    entityId: ctx.orgId,
  });

  revalidatePath("/billing");
  const { redirect } = await import("next/navigation");
  redirect("/billing?status=canceled");
}

/** Exported for tests / future billing UI: legal transition check passthrough. */
export async function isTransitionAllowed(from: string, to: string) {
  return canTransitionSubscription(from, to);
}
