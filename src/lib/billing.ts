import { prisma } from "@/lib/db";
import { planOf } from "@/lib/plans";
import { canTransitionSubscription } from "@/lib/subscription-state";

/**
 * Billing domain core (ADR-017, KNOWN_LIMITATIONS #2/#16).
 *
 * State ownership: the ONLY writers of Subscription.state are
 *   - `activatePlan` / `markPastDue` / `cancelSubscription` below, and
 *   - the trial bootstrap in src/lib/subscription.ts.
 * The browser never declares a subscription active: checkout completion is
 * driven exclusively by signature-verified webhook events.
 *
 * Every transition goes through the explicit table in
 * src/lib/subscription-state.ts; an illegal move throws instead of writing.
 */

export const PERIOD_DAYS = 30;

export class InvalidTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Illegal subscription transition ${from} → ${to}`);
  }
}

/** Authoritative entitlement read (same rule as entitlements.ts, DB-backed). */
export function isSubscriptionEntitled(
  state: string,
  trialEndsAt: Date | null,
): boolean {
  if (state === "ACTIVE") return true;
  if (state === "TRIALING") {
    return trialEndsAt !== null && trialEndsAt.getTime() > Date.now();
  }
  return false;
}

type SubscriptionStateName =
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED";

type PlanName = "STARTER" | "GROWTH" | "SCALE";

async function transitionGuarded(
  subscriptionId: string,
  from: string,
  to: string,
  data: {
    plan?: PlanName;
    seats?: number;
    currentPeriodStart?: Date;
    currentPeriodEnd?: Date;
    lastPaymentAt?: Date;
    lastPaymentId?: string;
    razorpaySubscriptionId?: string;
  },
) {
  if (!canTransitionSubscription(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
  // from-state condition prevents a stale read from clobbering a newer state.
  return prisma.subscription.updateMany({
    where: { id: subscriptionId, state: from as SubscriptionStateName },
    data: { state: to as SubscriptionStateName, ...data },
  });
}

export interface ActivateInput {
  plan: PlanName;
  seats: number;
  paymentId: string;
  periodDays?: number;
  providerSubscriptionId?: string | null;
}

/**
 * Move a subscription into ACTIVE from TRIALING, PAST_DUE or CANCELED
 * (first activation / renewal / reactivation). Idempotent when already
 * ACTIVE: the same or a retried activation event replays (same period).
 */
export async function activatePlan(
  orgId: string,
  input: ActivateInput,
): Promise<{ applied: boolean; from: string }> {
  const periodDays = input.periodDays ?? PERIOD_DAYS;
  const sub = await prisma.subscription.findUnique({ where: { orgId } });
  if (!sub) throw new Error("Subscription row missing — bootstrap first");

  const start = new Date();
  const end = new Date(Date.now() + periodDays * 86_400_000);
  const periodData = {
    plan: input.plan,
    seats: input.seats,
    currentPeriodStart: start,
    currentPeriodEnd: end,
    lastPaymentAt: start,
    lastPaymentId: input.paymentId,
    ...(input.providerSubscriptionId
      ? { razorpaySubscriptionId: input.providerSubscriptionId }
      : {}),
  };

  if (sub.state === "ACTIVE") {
    // Already-active: extend the period from the CURRENT period end when it
    // is still in the future (renewal before expiry), else from now.
    const base =
      sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() > Date.now()
        ? sub.currentPeriodEnd
        : start;
    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        ...periodData,
        currentPeriodStart: start,
        currentPeriodEnd: new Date(
          base.getTime() + periodDays * 86_400_000,
        ),
      },
    });
    return { applied: false, from: sub.state };
  }

  const res = await transitionGuarded(sub.id, sub.state, "ACTIVE", periodData);
  if (res.count === 0) {
    throw new InvalidTransitionError(sub.state, "ACTIVE");
  }
  return { applied: true, from: sub.state };
}

/** Renewal payment failed while ACTIVE (webhook `payment.failed`). */
export async function markPastDue(orgId: string): Promise<boolean> {
  const sub = await prisma.subscription.findUnique({ where: { orgId } });
  if (!sub) return false;
  if (sub.state !== "ACTIVE") return false; // TRIALING failures are not dunning
  const res = await transitionGuarded(sub.id, "ACTIVE", "PAST_DUE", {});
  return res.count > 0;
}

/** Explicit cancellation (ops action / final failure). Terminal. */
export async function cancelSubscription(orgId: string): Promise<boolean> {
  const sub = await prisma.subscription.findUnique({ where: { orgId } });
  if (!sub) return false;
  if (sub.state !== "ACTIVE" && sub.state !== "PAST_DUE") return false;
  const res = await transitionGuarded(sub.id, sub.state, "CANCELED", {});
  return res.count > 0;
}

/**
 * Expired-trial gate (server-side). Enforced in addition to isEntitled so a
 * state, not a timestamp comparison scattered across routes, decides access.
 * Called by requireEntitlement.
 */
export function trialHasExpired(state: string, trialEndsAt: Date | null): boolean {
  if (state !== "TRIALING") return false;
  return trialEndsAt === null || trialEndsAt.getTime() <= Date.now();
}

/** Plan catalog passthrough used by quoting (kept server-side only). */
export function quoteFor(planId: string, seats: number) {
  const plan = planOf(planId);
  return { plan, seats };
}
