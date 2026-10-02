import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getOrgContext } from "@/lib/tenancy";
import { planOf } from "@/lib/plans";
import { getOrCreateSubscription, subscriptionView } from "@/lib/subscription";
import {
  IconRail,
  ModuleSubnav,
  AiCreditsMeter,
  FocusTimer,
  SearchBar,
  CommandPalette,
} from "@/components/app-rail";
import { UserMenu, TrialBanner, TrialGate } from "@/components/app-shell";
import { AI_EMPLOYEES } from "@/lib/ai-team";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=%2Foverview");

  const ctx = await getOrgContext(session.user.id);
  if (!ctx) redirect("/login?callbackUrl=%2Foverview");

  // Subscription bootstrap: lazily creates the TRIALING row for orgs that
  // predate the billing lifecycle (idempotent, race-safe).
  const sub = await getOrCreateSubscription(ctx.orgId);
  const view = subscriptionView(sub);

  const org = await prisma.organization.findUnique({
    where: { id: ctx.orgId },
    select: { name: true, plan: true, aiCreditsUsed: true },
  });
  const plan = planOf(org?.plan);

  const enabledEmployees = await prisma.aiEmployee.findMany({
    where: { orgId: ctx.orgId, enabled: true },
    select: { key: true },
  });
  const teamNames = AI_EMPLOYEES.filter((e) =>
    enabledEmployees.some((row) => row.key === e.key),
  ).map((e) => e.name);

  const shellChrome = (
    <>
      <IconRail />
      <ModuleSubnav orgName={org?.name ?? "Workspace"} />
    </>
  );

  const sideChrome = (
    <div className="hidden w-60 shrink-0 flex-col border-l border-border bg-surface/40 xl:flex">
      <div className="flex-1" />
      <AiCreditsMeter
        used={org?.aiCreditsUsed ?? 0}
        limit={plan.aiCreditsPerMonth}
        teamNames={teamNames}
      />
      <FocusTimer />
    </div>
  );

  // Trial expiry gate: expired orgs see the plan chooser, not app routes
  // (BUSINESS_RULES RULE-ENT-04). Data is untouched; the gate is read-only
  // until a plan is purchased.
  if (!view.entitled) {
    return (
      <div className="flex min-h-dvh">
        {shellChrome}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center justify-end gap-3 border-b border-border bg-bg/80 px-4 backdrop-blur sm:px-6">
            <SearchBar />
            <UserMenu userName={session.user.name ?? session.user.email ?? "Account"} />
          </header>
          <main className="flex-1 px-4 py-6 sm:px-6">
            <TrialGate plan={plan.name} />
          </main>
        </div>
        {sideChrome}
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh">
      {shellChrome}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-bg/80 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-2 text-sm text-muted">
            <Link href="/dashboard" className="font-medium text-text hover:text-brand">
              {org?.name ?? "Workspace"}
            </Link>
            <span aria-hidden>·</span>
            <span>{plan.name} plan</span>
          </div>
          <div className="flex items-center gap-3">
            <SearchBar />
            <Link
              href="/settings/notifications"
              aria-label="Notifications"
              className="rounded-[var(--radius-control)] border border-border px-2 py-1.5 text-muted hover:border-brand hover:text-text"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" />
                <path d="M10.3 19a2 2 0 0 0 3.4 0" />
              </svg>
            </Link>
            <UserMenu userName={session.user.name ?? session.user.email ?? "Account"} />
          </div>
        </header>
        <TrialBanner view={view} />
        <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>
        <footer className="border-t border-border px-4 py-3 text-xs text-muted sm:px-6">
          BizMemory — one connected memory for your whole business.
        </footer>
      </div>
      {sideChrome}
      <CommandPalette />
    </div>
  );
}
