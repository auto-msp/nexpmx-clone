/**
 * Invoice lifecycle state machine (BUSINESS_RULES.md RULE-INV-01).
 * Extracted from the action so integration tests exercise the exact table
 * the runtime uses — not a copy of it.
 */

export const INVOICE_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["SENT"],
  SENT: ["PAID", "OVERDUE"],
  PAID: [],
  OVERDUE: ["PAID"],
};

export function canTransition(from: string, to: string): boolean {
  return INVOICE_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Valid next states for the UI's action buttons. */
export function nextActionsFor(status: string): Array<{ to: string; label: string }> {
  const labels: Record<string, string> = {
    SENT: "Send",
    PAID: "Mark paid",
    OVERDUE: "Mark paid",
  };
  return (INVOICE_TRANSITIONS[status] ?? []).map((to) => ({
    to,
    label: labels[to] ?? to,
  }));
}
