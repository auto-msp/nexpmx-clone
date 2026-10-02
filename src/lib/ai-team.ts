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
