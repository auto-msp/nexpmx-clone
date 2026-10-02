import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getOrgContext } from "@/lib/tenancy";
import { planOf } from "@/lib/plans";
import { getOrCreateSubscription, subscriptionView } from "@/lib/subscription";
import { IconRail, ModuleSubnav, TopBar, AiFab, CommandPalette } from "@/components/app-rail";
import { TrialBanner, TrialGate } from "@/components/app-shell";
import { AI_EMPLOYEES } from "@/lib/ai-team";
import { getSubnavData } from "@/lib/subnav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=%2Foverview");

  const ctx = await getOrgContext(session.user.id);
  if (!ctx) redirect("/login?callbackUrl=%2Foverview");

  // Subscription bootstrap: lazily creates the TRIALING row for orgs that
  // predate the billing lifecycle (idempotent, race-safe).
  const sub = await getOrCreateSubscription(ctx.orgId);
  const view = subscriptionView(sub);

  const [org, enabledEmployees, subnav] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: ctx.orgId },
      select: { name: true, plan: true, aiCreditsUsed: true },
    }),
    prisma.aiEmployee.findMany({ where: { orgId: ctx.orgId, enabled: true }, select: { key: true } }),
    getSubnavData(ctx.orgId, session.user.id),
  ]);
  const plan = planOf(org?.plan);
  const teamNames = AI_EMPLOYEES.filter((e) => enabledEmployees.some((row) => row.key === e.key)).map((e) => e.name);

  const userName = session.user.name ?? session.user.email ?? "Account";
  const userImage = session.user.image ?? null;

  const rail = (
    <>
      <IconRail />
      <ModuleSubnav
        orgName={org?.name ?? "Workspace"}
        userName={userName}
        userRole={ctx.role}
        userImage={userImage}
        credits={{ used: org?.aiCreditsUsed ?? 0, limit: plan.aiCreditsPerMonth, teamNames }}
        dynamic={subnav.data}
      />
    </>
  );

  // Trial expiry gate: expired orgs see the plan chooser, not app routes
  // (BUSINESS_RULES RULE-ENT-04). Data is untouched; the gate is read-only
  // until a plan is purchased.
  if (!view.entitled) {
    return (
      <div className="flex min-h-dvh">
        {rail}
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar userName={userName} userImage={userImage} unread={0} />
          <main className="flex-1 px-4 py-6 sm:px-6">
            <TrialGate plan={plan.name} />
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh">
      {rail}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar userName={userName} userImage={userImage} unread={subnav.unread} />
        <TrialBanner view={view} />
        <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-xs text-muted sm:px-6">
          <span className="font-medium text-text">BizMemory</span>
          <span>One connected memory for your whole business.</span>
        </footer>
      </div>
      <AiFab />
      <CommandPalette />
    </div>
  );
}
