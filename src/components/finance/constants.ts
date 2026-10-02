/** Fixed expense categories (value stored in Expense.category). */
export const EXPENSE_CATEGORIES = [
  "Software & tools",
  "Hosting & infrastructure",
  "Salaries & contractors",
  "Marketing & ads",
  "Travel",
  "Office & rent",
  "Utilities & internet",
  "Professional fees",
  "Equipment",
  "Taxes & fees",
  "Other",
] as const;

export const GST_OPTIONS = [0, 500, 1200, 1800, 2800] as const;

export const INVOICE_STATUSES = ["DRAFT", "SENT", "OVERDUE", "PAID"] as const;
export const PROPOSAL_STATUS_TABS = ["DRAFT", "SENT", "VIEWED", "ACCEPTED", "REJECTED"] as const;

/** Postgres int4 ceiling for paise columns (≈ ₹2.14 crore). */
export const MAX_MINOR = 2_147_483_647;
