/**
 * AI Team catalog — definitions of the virtual employees.
 *
 * PROVENANCE (screenshot evidence, authorized account surface, 2026-10-02):
 * five role-carded employees — Aria (Project Manager), Vikram (Finance),
 * Maya (Operations), Leo (Client Success), Sage (Sales) — each with a rate
 * card and an ownership blurb. Names/roles are structural facts; ALL copy in
 * this repo is original (clean-room, see README provenance notice).
 */

export interface AiEmployeeDefinition {
  key: "aria" | "vikram" | "maya" | "leo" | "sage";
  name: string;
  role: string;
  avatarHue: string; // tailwind bg class token for the avatar chip
  /** Monthly credit cost when enabled; 0 = included with the AI module. */
  creditPrice: number;
  owns: string[];
}

export const AI_EMPLOYEES: AiEmployeeDefinition[] = [
  {
    key: "aria",
    name: "Aria",
    role: "Project Manager",
    avatarHue: "bg-brand",
    creditPrice: 0,
    owns: [
      "Turns signed scopes into task lists",
      "Runs weekly project status reports",
      "Keeps the risk register current",
    ],
  },
  {
    key: "vikram",
    name: "Vikram",
    role: "Finance",
    avatarHue: "bg-success",
    creditPrice: 20,
    owns: [
      "Drafts invoices from accepted proposals",
      "Runs the overdue-payment escalation ladder",
      "Summarises receivables every Monday",
    ],
  },
  {
    key: "maya",
    name: "Maya",
    role: "Operations",
    avatarHue: "bg-warn",
    creditPrice: 20,
    owns: [
      "Writes and maintains SOPs",
      "Allocates people across projects",
      "Runs resourcing checks before kick-off",
    ],
  },
  {
    key: "leo",
    name: "Leo",
    role: "Client Success",
    avatarHue: "bg-brand-strong",
    creditPrice: 0,
    owns: [
      "Sends weekly client updates",
      "Prepares quarterly business reviews",
      "Onboards new clients after signing",
    ],
  },
  {
    key: "sage",
    name: "Sage",
    role: "Sales",
    avatarHue: "bg-danger",
    creditPrice: 30,
    owns: [
      "Structures discovery calls",
      "Opens proposals and frames price",
      "Handles common objections",
    ],
  },
];

export function employeeOf(key: string): AiEmployeeDefinition | null {
  return AI_EMPLOYEES.find((e) => e.key === key) ?? null;
}

/**
 * Total monthly credit surcharge for the enabled set. Included employees
 * (price 0) never add cost. Pure — unit-tested.
 */
export function teamCreditPrice(enabledKeys: string[]): number {
  const set = new Set(enabledKeys);
  return AI_EMPLOYEES.filter((e) => set.has(e.key)).reduce(
    (sum, e) => sum + e.creditPrice,
    0,
  );
}

/* ── Presentation helpers for the AI team page (additive) ─────────────────── */

/** One-line summary shown on each employee card. */
export const AI_EMPLOYEE_SUMMARY: Record<string, string> = {
  aria: "Plans the work, drafts status updates and breaks a scope into tasks.",
  vikram: "Drafts invoices, chases late payments and prepares money summaries.",
  maya: "Writes process documents and suggests who should work on what.",
  leo: "Keeps clients informed with updates, check-ins and review preparation.",
  sage: "Prepares call structures, proposal intros and answers to common objections.",
};

/** Tinted avatar classes (token based, readable in both themes). */
export const AI_EMPLOYEE_TINT: Record<string, string> = {
  aria: "bg-brand/15 text-brand",
  vikram: "bg-success/15 text-success",
  maya: "bg-warn/15 text-warn",
  leo: "bg-brand/15 text-brand",
  sage: "bg-surface-2 text-text",
};

export const CUSTOM_EMPLOYEE_TINT = "bg-surface-2 text-text";

/** Starter prompts offered when assigning a task, per employee. */
export const AI_TASK_SUGGESTIONS: Record<string, string[]> = {
  aria: [
    "Break the next project's scope into a task list",
    "Draft this week's status update for my active projects",
    "Which projects look likely to slip, and why?",
  ],
  vikram: [
    "Summarise what clients owe us and what is overdue",
    "Draft a polite reminder for the oldest unpaid invoice",
    "Which projects have work done but nothing billed?",
  ],
  maya: [
    "Write a short SOP for onboarding a new client",
    "Suggest how to spread next week's work across the team",
    "List the processes we should document first",
  ],
  leo: [
    "Summarise everything we know about a client before my call",
    "Draft a friendly check-in message for a quiet client",
    "Prepare talking points for a quarterly review",
  ],
  sage: [
    "Draft an opening paragraph for a new proposal",
    "Outline a discovery call for a new lead",
    "Suggest replies to the objection that our price is high",
  ],
  custom: [
    "Summarise everything we know about our best clients",
    "Draft a proposal intro for this project",
    "What do we know about our best-performing projects?",
  ],
};
