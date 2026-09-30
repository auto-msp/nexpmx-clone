import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getOrgContext } from "@/lib/tenancy";
import { planOf } from "@/lib/plans";
import { AppSidebar, UserMenu } from "@/components/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=%2Foverview");

  const ctx = await getOrgContext(session.user.id);
  if (!ctx) redirect("/login?callbackUrl=%2Foverview");

  const org = await prisma.organization.findUnique({
    where: { id: ctx.orgId },
    select: { name: true, plan: true },
  });
  const plan = planOf(org?.plan);

  return (
    <div className="flex min-h-dvh">
      <AppSidebar plan={plan.name} orgName={org?.name ?? "Workspace"} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-end gap-3 border-b border-border bg-bg/80 px-4 backdrop-blur sm:px-6">
          <UserMenu userName={session.user.name ?? session.user.email ?? "Account"} />
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
