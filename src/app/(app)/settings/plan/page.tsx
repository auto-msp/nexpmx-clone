import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getOrgContext } from "@/lib/tenancy";
import { prisma } from "@/lib/db";
import { planOf, formatInr } from "@/lib/plans";
import { getOrCreateSubscription, subscriptionView } from "@/lib/subscription";
import { storageUsedBytes } from "@/lib/entitlements";
import { Badge, ButtonLink, Card, SectionTitle, Table } from "@/components/ui";

export const metadata: Metadata = { title: "Plan & usage", robots: { index: false } };

function Meter({ label, used, cap }: { label: string; used: number; cap: number | null }) {
  const unlimited = cap === null;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(1, cap)) * 100));
  const tone = pct >= 90 ? "danger" : pct >= 75 ? "warn" : "neutral";
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">{label}</span>
        <span className="font-medium">
          {used} {unlimited ? "/ unlimited" : `/ ${cap}`}
        </span>
      </div>
      {unlimited ? (
        <div className="mt-1 h-1.5 rounded-full bg-surface-2" />
      ) : (
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div
            className={
              tone === "danger"
                ? "h-full rounded-full bg-danger"
                : tone === "warn"
                  ? "h-full rounded-full bg-warn"
                  : "h-full rounded-full bg-brand"
            }
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={used}
            aria-valuemin={0}
            aria-valuemax={cap ?? undefined}
            aria-label={`${label} usage`}
          />
        </div>
      )}
    </div>
  );
}

export default async function PlanUsagePage() {
  const session = await auth();
  const ctx = await getOrgContext(session!.user!.id);

  const [org, sub, members, activeClients, storageBytes, automations] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: ctx!.orgId },
      select: { plan: true, aiCreditsUsed: true },
    }),
    getOrCreateSubscription(ctx!.orgId),
    prisma.membership.count({ where: { orgId: ctx!.orgId } }),
    prisma.client.count({ where: { orgId: ctx!.orgId, status: "ACTIVE" } }),
    storageUsedBytes(ctx!.orgId),
    prisma.automation.count({ where: { orgId: ctx!.orgId, enabled: true } }),
  ]);

  const plan = planOf(org?.plan);
  const view = subscriptionView(sub);
  const storageMb = storageBytes / (1024 * 1024);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Plan &amp; usage</h1>
        <p className="mt-1 text-sm text-muted">What you are on, what you have used, what is left.</p>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{plan.name}</h2>
              <Badge tone={view.state === "ACTIVE" ? "success" : view.state === "TRIALING" ? "brand" : "warn"}>
                {view.state}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted">
              {formatInr(plan.pricePerUserMinor)} per user / month · {plan.blurb}
            </p>
            {view.state === "TRIALING" && !view.expired && view.daysRemaining !== null ? (
              <p className="mt-1 text-xs text-brand">
                Trial — {view.daysRemaining} {view.daysRemaining === 1 ? "day" : "days"} left
                {view.trialEndsAt ? ` (ends ${view.trialEndsAt.toISOString().slice(0, 10)})` : ""}
              </p>
            ) : null}
          </div>
          <ButtonLink href="/billing" className="px-4 py-2 text-sm">
            {view.state === "ACTIVE" ? "Change plan" : "Activate a plan"}
          </ButtonLink>
        </div>
      </Card>

      <Card>
        <SectionTitle>Usage this cycle</SectionTitle>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <Meter label="Seats" used={members} cap={plan.maxSeats} />
          <Meter label="Active clients" used={activeClients} cap={plan.maxActiveClients} />
          <Meter
            label="Storage (MB)"
            used={Math.round(storageMb)}
            cap={plan.storageMb}
          />
          <Meter
            label="AI credits"
            used={org?.aiCreditsUsed ?? 0}
            cap={plan.aiCreditsPerMonth}
          />
          <Meter label="Automations (monthly runs)" used={automations} cap={plan.automationRunsPerMonth} />
        </div>
        <p className="mt-4 text-xs text-muted">
          Storage is measured from stored documents ({(storageBytes / (1024 * 1024)).toFixed(1)} MB used of{" "}
          {plan.storageMb} MB).
        </p>
      </Card>

      <Card>
        <SectionTitle>What each plan includes</SectionTitle>
        <div className="mt-4">
          <Table head={["Capability", "Starter", "Growth", "Scale"]}>
            <tr>
              <td className="px-4 py-2.5 font-medium">AI credits / month</td>
              <td className="px-4 py-2.5 text-muted">1,000</td>
              <td className="px-4 py-2.5 text-muted">2,500</td>
              <td className="px-4 py-2.5 text-muted">10,000</td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 font-medium">Seats</td>
              <td className="px-4 py-2.5 text-muted">10</td>
              <td className="px-4 py-2.5 text-muted">50</td>
              <td className="px-4 py-2.5 text-muted">Unlimited</td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 font-medium">Storage</td>
              <td className="px-4 py-2.5 text-muted">10 GB</td>
              <td className="px-4 py-2.5 text-muted">20 GB</td>
              <td className="px-4 py-2.5 text-muted">100 GB</td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 font-medium">Automation runs</td>
              <td className="px-4 py-2.5 text-muted">Unlimited</td>
              <td className="px-4 py-2.5 text-muted">500 / mo</td>
              <td className="px-4 py-2.5 text-muted">Unlimited</td>
            </tr>
          </Table>
        </div>
        <p className="mt-3 text-xs text-muted">
          Feature lists per plan live on the{" "}
          <Link href="/pricing" className="text-brand hover:underline">pricing page</Link>.
        </p>
      </Card>
    </div>
  );
}
