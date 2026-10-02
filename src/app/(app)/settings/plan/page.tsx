import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { pageContext } from "@/lib/page";
import { PLANS, planOf, formatInr } from "@/lib/plans";
import { getOrCreateSubscription, subscriptionView } from "@/lib/subscription";
import { storageUsedBytes } from "@/lib/entitlements";
import { seatsInUse } from "@/lib/seats";
import { fmtDate } from "@/lib/format";
import { PageHeader, Panel, ProgressBar } from "@/components/kit";
import { Icon } from "@/components/kit-icons";
import { Badge, ButtonLink, cx } from "@/components/ui";

export const metadata: Metadata = { title: "Plan & usage", robots: { index: false } };

function Meter({ label, used, cap, unit, hint }: { label: string; used: number; cap: number | null; unit?: string; hint?: string }) {
  const unlimited = cap === null;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(1, cap)) * 100));
  const tone = pct >= 90 ? "danger" : pct >= 75 ? "warn" : "brand";
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
        <span className="text-muted">{label}</span>
        <span className="font-medium tabular-nums">
          {used.toLocaleString("en-IN")}
          {unit ? ` ${unit}` : ""} {unlimited ? "of unlimited" : `of ${cap.toLocaleString("en-IN")}`}
        </span>
      </div>
      {unlimited ? <div className="h-1.5 rounded-full bg-surface-2" /> : <ProgressBar value={used} max={cap} tone={tone} />}
      {hint ? <p className="mt-1 text-[11px] text-muted">{hint}</p> : null}
    </div>
  );
}

function gb(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toLocaleString("en-IN", { maximumFractionDigits: 0 })} GB` : `${mb} MB`;
}

export default async function PlanUsagePage() {
  const { orgId } = await pageContext();

  const [org, sub, members, seatsUsed, activeClients, storageBytes, automations] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId }, select: { plan: true, aiCreditsUsed: true, storageLimitMb: true } }),
    getOrCreateSubscription(orgId),
    prisma.membership.count({ where: { orgId } }),
    seatsInUse(orgId),
    prisma.client.count({ where: { orgId, status: "ACTIVE" } }),
    storageUsedBytes(orgId),
    prisma.automation.count({ where: { orgId, enabled: true } }),
  ]);

  const plan = planOf(org?.plan);
  const view = subscriptionView(sub);
  const storageMb = storageBytes / (1024 * 1024);
  const storageCapMb = Math.max(org?.storageLimitMb ?? 0, plan.storageMb);
  // Seat cap: purchased seats on an active subscription, else the plan's cap.
  const seatCap = sub.state === "ACTIVE" && sub.seats !== null ? sub.seats : plan.maxSeats;
  const pendingSeats = Math.max(0, seatsUsed - members);

  return (
    <>
      <PageHeader
        title="Plan & usage"
        subtitle="What you are on, what you have used and what is left."
        actions={
          <ButtonLink href="/billing">
            <Icon name="wallet" className="h-4 w-4" />
            {view.state === "ACTIVE" ? "Manage billing" : "Choose a plan"}
          </ButtonLink>
        }
      />

      <div className="space-y-6">
        <Panel>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold">{plan.name}</h2>
                <Badge tone={view.state === "ACTIVE" ? "success" : view.state === "TRIALING" ? "brand" : "warn"}>{view.state.toLowerCase().replace("_", " ")}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted">
                {formatInr(plan.pricePerUserMinor)} per user a month. {plan.blurb}
              </p>
              {view.state === "TRIALING" && !view.expired && view.daysRemaining !== null ? (
                <p className="mt-1 text-xs text-brand">
                  Trial: {view.daysRemaining} {view.daysRemaining === 1 ? "day" : "days"} left{view.trialEndsAt ? ` (ends ${fmtDate(view.trialEndsAt)})` : ""}
                </p>
              ) : null}
              {view.state === "ACTIVE" && sub.currentPeriodEnd ? <p className="mt-1 text-xs text-muted">Current period ends {fmtDate(sub.currentPeriodEnd)}.</p> : null}
            </div>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
              <dt className="text-muted">Seats</dt>
              <dd className="text-right font-medium">{seatCap ?? "Unlimited"}</dd>
              <dt className="text-muted">Members</dt>
              <dd className="text-right font-medium">{members}</dd>
            </dl>
          </div>
        </Panel>

        <Panel title="Usage this cycle">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Meter label="Seats" used={seatsUsed} cap={seatCap} hint={pendingSeats > 0 ? `${members} members + ${pendingSeats} pending invitation${pendingSeats === 1 ? "" : "s"}` : undefined} />
            <Meter label="Active clients" used={activeClients} cap={plan.maxActiveClients} />
            <Meter label="Storage" used={Math.round(storageMb)} cap={storageCapMb} unit="MB" hint={`${storageMb.toFixed(1)} MB in stored documents`} />
            <Meter label="AI credits" used={org?.aiCreditsUsed ?? 0} cap={plan.aiCreditsPerMonth} />
            <Meter label="Automations switched on" used={automations} cap={plan.automationRunsPerMonth} />
          </div>
        </Panel>

        <section aria-label="Plans">
          <h2 className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Compare plans</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {Object.values(PLANS).map((p) => {
              const current = p.id === plan.id;
              return (
                <div key={p.id} className={cx("flex flex-col rounded-[var(--radius-card)] border bg-surface p-5", current ? "border-brand" : "border-border")}>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-semibold">{p.name}</h3>
                    {current ? <Badge tone="brand">Current plan</Badge> : null}
                  </div>
                  <p className="mt-1 text-xs text-muted">{p.blurb}</p>
                  <p className="mt-3 text-2xl font-semibold tracking-tight">
                    {formatInr(p.pricePerUserMinor)}
                    <span className="text-xs font-normal text-muted"> / user / month</span>
                  </p>
                  <dl className="mt-3 space-y-1 text-xs">
                    <div className="flex justify-between">
                      <dt className="text-muted">AI credits</dt>
                      <dd>{p.aiCreditsPerMonth.toLocaleString("en-IN")} / month</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted">Seats</dt>
                      <dd>{p.maxSeats ?? "Unlimited"}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted">Active clients</dt>
                      <dd>{p.maxActiveClients ?? "Unlimited"}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted">Storage</dt>
                      <dd>{gb(p.storageMb)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted">Automation runs</dt>
                      <dd>{p.automationRunsPerMonth === null ? "Unlimited" : `${p.automationRunsPerMonth} / month`}</dd>
                    </div>
                  </dl>
                  <ul className="mt-3 flex-1 space-y-1 border-t border-border pt-3 text-xs text-muted">
                    {p.features.map((f) => (
                      <li key={f} className="flex gap-2">
                        <Icon name="check" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4">
                    {current ? (
                      <ButtonLink href="/billing" variant="secondary" className="w-full">
                        {view.state === "ACTIVE" ? "Manage billing" : "Activate this plan"}
                      </ButtonLink>
                    ) : (
                      <ButtonLink href="/billing" variant="secondary" className="w-full">
                        Switch in billing
                      </ButtonLink>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted">Checkout, seat changes and invoices for your subscription live in Billing.</p>
        </section>
      </div>
    </>
  );
}
