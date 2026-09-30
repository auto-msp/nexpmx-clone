import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getOrgContext } from "@/lib/tenancy";
import { planOf } from "@/lib/plans";
import { getOrCreateSubscription, subscriptionView } from "@/lib/subscription";
import { AppSidebar, UserMenu, TrialBanner, TrialGate } from "@/components/app-shell";

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
    select: { name: true, plan: true },
  });
  const plan = planOf(org?.plan);

  // Trial expiry gate: expired orgs see the plan chooser, not app routes
  // (BUSINESS_RULES RULE-ENT-04). Data is untouched; the gate is read-only
  // until a plan is set (manual until billing lands, KNOWN_LIMITATIONS #2).
  if (!view.entitled) {
    return (
      <div className="flex min-h-dvh">
        <AppSidebar
          plan={plan.name}
          orgName={org?.name ?? "Workspace"}
          trial={{ daysRemaining: null, expired: true }}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center justify-end gap-3 border-b border-border bg-bg/80 px-4 backdrop-blur sm:px-6">
            <UserMenu userName={session.user.name ?? session.user.email ?? "Account"} />
          </header>
          <main className="flex-1 px-4 py-6 sm:px-6">
            <TrialGate plan={plan.name} />
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh">
      <AppSidebar
        plan={plan.name}
        orgName={org?.name ?? "Workspace"}
        trial={{ daysRemaining: view.daysRemaining, expired: false }}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-end gap-3 border-b border-border bg-bg/80 px-4 backdrop-blur sm:px-6">
          <UserMenu userName={session.user.name ?? session.user.email ?? "Account"} />
        </header>
        <TrialBanner view={view} />
        <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
