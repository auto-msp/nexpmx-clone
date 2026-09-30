import type { Metadata } from "next";
import { ButtonLink, Card, Table } from "@/components/ui";
import { PLANS, formatInr } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Pricing — Simple, Transparent Plans",
  description:
    "Create an account free. Choose a plan to open your workspace. No hidden fees.",
};

const PLAN_ORDER = [PLANS.STARTER, PLANS.GROWTH, PLANS.SCALE] as const;

const COMPARISON: Array<{ label: string; value: (p: typeof PLANS.STARTER) => string }> = [
  { label: "Team seats", value: (p) => (p.maxSeats === null ? "Unlimited" : String(p.maxSeats)) },
  { label: "Active clients", value: (p) => (p.maxActiveClients === null ? "Unlimited" : String(p.maxActiveClients)) },
  { label: "File storage", value: (p) => `${Math.round(p.storageMb / 1024)} GB` },
  { label: "AI credits / month", value: (p) => p.aiCreditsPerMonth.toLocaleString("en-IN") },
  {
    label: "Automation runs / month",
    value: (p) => (p.automationRunsPerMonth === null ? "Unlimited" : String(p.automationRunsPerMonth)),
  },
];

const FAQ = [
  {
    q: "Can I switch plans anytime?",
    a: "Yes. Upgrade or downgrade at any time; changes apply to your next billing cycle.",
  },
  {
    q: "Is there a free trial?",
    a: "Creating an account is free. The workspace opens once you choose a plan and authorize payment — you only pay for the seats you buy.",
  },
  {
    q: "What happens when I exceed my limits?",
    a: "We notify you as you approach limits. You can upgrade or manage usage; access is never cut off abruptly.",
  },
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Simple, Transparent Pricing
      </h1>
      <p className="mt-3 max-w-2xl text-lg text-muted">
        Create an account free. Choose a plan to open your workspace.
      </p>

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {PLAN_ORDER.map((plan) => (
          <Card key={plan.id} className="flex flex-col">
            <h2 className="font-semibold">{plan.name}</h2>
            <p className="mt-2 text-3xl font-semibold">
              {formatInr(plan.pricePerUserMinor)}
              <span className="text-sm font-normal text-muted"> / user / mo</span>
            </p>
            <p className="mt-2 text-sm text-muted">{plan.blurb}</p>
            <ul className="mt-4 flex-1 space-y-2 text-sm">
              {plan.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <span aria-hidden className="text-brand">✓</span>
                  <span className="text-muted">{f}</span>
                </li>
              ))}
            </ul>
            <ButtonLink href="/login" className="mt-6">
              Start with {plan.name}
            </ButtonLink>
          </Card>
        ))}
      </div>

      <h2 className="mt-16 text-2xl font-semibold tracking-tight">Compare plans</h2>
      <div className="mt-6">
        <Table
          head={["Feature", "Starter", "Growth", "Scale"]}
        >
          {COMPARISON.map((row) => (
            <tr key={row.label}>
              <th scope="row" className="px-4 py-3 font-medium">{row.label}</th>
              {PLAN_ORDER.map((p) => (
                <td key={p.id} className="px-4 py-3 text-muted">{row.value(p)}</td>
              ))}
            </tr>
          ))}
        </Table>
      </div>

      <h2 className="mt-16 text-2xl font-semibold tracking-tight">
        Frequently Asked Questions
      </h2>
      <div className="mt-6 space-y-4">
        {FAQ.map((item, i) => (
          <Card key={item.q}>
            <h3 className="font-medium">
              <span className="mr-2 text-brand">{String(i + 1).padStart(2, "0")}</span>
              {item.q}
            </h3>
            <p className="mt-2 text-sm text-muted">{item.a}</p>
          </Card>
        ))}
      </div>

      <div className="mt-16 flex flex-wrap items-center gap-3">
        <ButtonLink href="/login">Get started</ButtonLink>
        <span className="text-sm text-muted">Our team is here to help you find the right plan.</span>
      </div>
    </div>
  );
}
