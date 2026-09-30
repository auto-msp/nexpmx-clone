import { prisma } from "@/lib/db";

/**
 * Subscription lifecycle (docs/ASSUMPTIONS.md §8).
 *
 * Evidence: the account holder reports a 14-day trial at signup (confirmed
 * 2026-09-30). Lifecycle: SIGNUP → TRIALING(14d) → plan+payment → ACTIVE,
 * with an expired-trial gate back to the plan chooser. Checkout/payment
 * remains out of scope (KNOWN_LIMITATIONS #2) — TRIALING is the enforced
 * state today; moving to ACTIVE is a manual DB action until billing lands.
 */

export const TRIAL_DAYS = 14;

/** Org is fully usable: any state where the product should open. */
export function isEntitled(state: string, trialEndsAt: Date | null): boolean {
  if (state === "ACTIVE") return true;
  if (state === "TRIALING") {
    return trialEndsAt !== null && trialEndsAt.getTime() > Date.now();
  }
  return false; // PAST_DUE / CANCELED / unknown
}

export interface SubscriptionView {
  state: string;
  trialEndsAt: Date | null;
  daysRemaining: number | null;
  expired: boolean;
  entitled: boolean;
}

/** Shape the subscription for UI (banner, countdown, gate). */
export function subscriptionView(
  sub: { state: string; trialEndsAt: Date | null } | null,
): SubscriptionView {
  if (!sub) {
    // No row should not happen (created on org bootstrap) — treat as trial
    // with no end (grandfathered dev data) rather than locking everyone out.
    return {
      state: "TRIALING",
      trialEndsAt: null,
      daysRemaining: null,
      expired: false,
      entitled: true,
    };
  }
  const entitled = isEntitled(sub.state, sub.trialEndsAt);
  const daysRemaining = sub.trialEndsAt
    ? Math.max(
        0,
        Math.ceil((sub.trialEndsAt.getTime() - Date.now()) / 86_400_000),
      )
    : null;
  return {
    state: sub.state,
    trialEndsAt: sub.trialEndsAt,
    daysRemaining,
    expired: !entitled,
    entitled,
  };
}

/** Read (or lazily create) the org's subscription row. */
export async function getOrCreateSubscription(orgId: string) {
  const existing = await prisma.subscription.findUnique({ where: { orgId } });
  if (existing) return existing;
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { plan: true },
  });
  try {
    return await prisma.subscription.create({
      data: {
        orgId,
        state: "TRIALING",
        plan: org?.plan ?? "STARTER",
        trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000),
      },
    });
  } catch {
    // Lost a create race — the winner's row is fine for us too.
    return prisma.subscription.findUniqueOrThrow({ where: { orgId } });
  }
}

/**
 * Server actions throw this to make the (app) error boundary render the
 * trial-expired page. `__bmbilling__` avoids string matching on message
 * text and keeps the marker out of user-facing copy.
 */
export class TrialExpiredError extends Error {
  readonly __bmbilling__ = true;
  readonly trialEndsAt: Date | null;
  constructor(trialEndsAt: Date | null) {
    super("Subscription expired");
    this.trialEndsAt = trialEndsAt;
  }
}
