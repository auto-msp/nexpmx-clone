/**
 * Plan catalog and entitlement helpers.
 *
 * PROVENANCE: plan structure (three tiers, per-user pricing, AI credits,
 * seat/active-client/storage/automation limits) is OBSERVED from the target's
 * public pricing page. Prices are OUR OWN positioning — deliberately set
 * different from the target so this is a clean-room reconstruction, not a
 * copy of their commercial terms.
 */

export type PlanId = "STARTER" | "GROWTH" | "SCALE";

export interface PlanDefinition {
  id: PlanId;
  name: string;
  /** Monthly price per user in minor units (paise). */
  pricePerUserMinor: number;
  aiCreditsPerMonth: number;
  maxSeats: number | null;
  maxActiveClients: number | null;
  storageMb: number;
  automationRunsPerMonth: number | null; // null = unlimited
  blurb: string;
  features: string[];
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  STARTER: {
    id: "STARTER",
    name: "Starter",
    pricePerUserMinor: 49_900,
    aiCreditsPerMonth: 1_000,
    maxSeats: 10,
    maxActiveClients: 10,
    storageMb: 10_240,
    automationRunsPerMonth: null,
    blurb: "Put your business in one place.",
    features: [
      "Clients & contact management",
      "Projects & tasks",
      "Files & document organisation",
      "Business Memory foundation",
      "Basic invoicing",
      "Basic dashboards",
    ],
  },
  GROWTH: {
    id: "GROWTH",
    name: "Growth",
    pricePerUserMinor: 99_900,
    aiCreditsPerMonth: 2_500,
    maxSeats: 50,
    maxActiveClients: null,
    storageMb: 20_480,
    automationRunsPerMonth: 500,
    blurb: "Give your business a memory.",
    features: [
      "Everything in Starter",
      "Full Business Memory",
      "AI search across your business",
      "AI reports & summaries",
      "Invoicing + UPI payment links",
      "Client Portal",
      "Team visibility",
      "500 automation runs / month",
    ],
  },
  SCALE: {
    id: "SCALE",
    name: "Scale",
    pricePerUserMinor: 299_900,
    aiCreditsPerMonth: 10_000,
    maxSeats: null,
    maxActiveClients: null,
    storageMb: 102_400,
    automationRunsPerMonth: null,
    blurb: "Put AI to work across your business.",
    features: [
      "Everything in Growth",
      "5 AI agents",
      "Advanced automations",
      "Advanced reports & SOPs",
      "Team permissions & roles",
      "Approval controls",
      "Unlimited automation runs",
    ],
  },
};

export function planOf(id: string | null | undefined): PlanDefinition {
  return PLANS[(id as PlanId) ?? "STARTER"] ?? PLANS.STARTER;
}

/** Format minor units as an INR string like ₹499. */
export function formatInr(minor: number): string {
  return `₹${(minor / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}
