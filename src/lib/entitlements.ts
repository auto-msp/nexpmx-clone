import { prisma } from "@/lib/db";
import { planOf } from "@/lib/plans";
import {
  getOrCreateSubscription,
  TrialExpiredError,
} from "@/lib/subscription";
import { isSubscriptionEntitled } from "@/lib/billing";

/**
 * Entitlement guards shared by pages and actions (BUSINESS_RULES.md).
 *
 * Enforcement order everywhere:
 *   session → RBAC → zod → entitlement → tenanted write → audit
 */

/**
 * Trial/subscription gate for (app) pages and actions.
 * Throws TrialExpiredError (rendered as the trial-expired page by the
 * (app) error boundary) when the org is not entitled.
 */
export async function requireEntitlement(orgId: string): Promise<void> {
  const sub = await getOrCreateSubscription(orgId);
  if (!sub) return; // defensive; getOrCreate always returns
  // Single entitlement rule shared with the billing core (ACTIVE, or an
  // unexpired TRIALING) — PAST_DUE/CANCELED/expired-trial all refused.
  if (!isSubscriptionEntitled(sub.state, sub.trialEndsAt)) {
    throw new TrialExpiredError(sub.trialEndsAt);
  }
}

/** Current storage usage for the org in bytes (sum of stored documents). */
export async function storageUsedBytes(orgId: string): Promise<number> {
  const agg = await prisma.document.aggregate({
    where: { orgId },
    _sum: { sizeBytes: true },
  });
  return agg._sum.sizeBytes ?? 0;
}

export interface StorageEntitlementResult {
  allowed: boolean;
  reason?: "file_too_large" | "storage_full";
  planName?: string;
  storageMb?: number;
}

/**
 * Plan storage cap: reject before writing when this upload would exceed
 * `plan.storageMb` (BUSINESS_RULES RULE-ENT-03). Per-file hard ceiling is
 * enforced separately in the action via MAX_UPLOAD_BYTES.
 */
export async function checkStorageEntitlement(
  orgId: string,
  incomingBytes: number,
): Promise<StorageEntitlementResult> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { plan: true },
  });
  const plan = planOf(org?.plan);
  const used = await storageUsedBytes(orgId);
  const capBytes = plan.storageMb * 1024 * 1024;
  if (used + incomingBytes > capBytes) {
    return {
      allowed: false,
      reason: "storage_full",
      planName: plan.name,
      storageMb: plan.storageMb,
    };
  }
  return { allowed: true, planName: plan.name, storageMb: plan.storageMb };
}
