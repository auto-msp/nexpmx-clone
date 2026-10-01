/**
 * Subscription lifecycle state machine (BUSINESS_RULES.md RULE-SUB-01).
 *
 * Extracted from the billing actions so tests exercise the exact table the
 * runtime uses — the same pattern as src/lib/invoice-state.ts.
 *
 * Lifecycle (ASSUMPTIONS.md §8, evidence-backed 14-day trial):
 *
 *   TRIALING ──(checkout completes / webhook)──▶ ACTIVE
 *      │                                           │
 *      │ trial expires                              │ renewal payment fails
 *      ▼                                           ▼
 *   (expired gate: requireEntitlement refuses)  PAST_DUE ──(payment)──▶ ACTIVE
 *                                                  │
 *                                                  │ canceled / final failure
 *                                                  ▼
 *                                               CANCELED
 *
 * Forbidden moves (never allowed):
 *   - TRIALING → PAST_DUE/CANCELED (a trialing org simply expires)
 *   - CANCELED → TRIALING (trials never restart; payment re-ACTIVEs directly)
 *   - ACTIVE  → TRIALING (payment never re-enters trial)
 *
 * CANCELED → ACTIVE IS allowed: a canceled org that pays again reactivates
 * in place (self-serve resubscription) — the webhook must never hit a dead
 * end for a paying customer.
 */
export const SUBSCRIPTION_TRANSITIONS: Record<string, string[]> = {
  TRIALING: ["ACTIVE"],
  ACTIVE: ["PAST_DUE", "CANCELED"],
  PAST_DUE: ["ACTIVE", "CANCELED"],
  CANCELED: ["ACTIVE"],
};

export function canTransitionSubscription(from: string, to: string): boolean {
  if (from === to) return false; // no-op transitions are never "valid moves"
  return SUBSCRIPTION_TRANSITIONS[from]?.includes(to) ?? false;
}
