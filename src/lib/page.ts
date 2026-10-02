import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getOrgContext } from "@/lib/tenancy";
import { prisma } from "@/lib/db";
import { can, canRead, type Permission } from "@/lib/rbac";

/**
 * Per-page guard for server components under (app). The layout already
 * redirects unauthenticated users, but pages need the ids too.
 *
 *   const { orgId, userId, role, canWrite } = await pageContext("project:write");
 */
export async function pageContext(writePermission?: Permission) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=%2Foverview");
  const ctx = await getOrgContext(session.user.id);
  if (!ctx || !canRead(ctx.role)) redirect("/login?callbackUrl=%2Foverview");
  return {
    session,
    userId: ctx.userId,
    orgId: ctx.orgId,
    role: ctx.role,
    userName: session.user.name ?? session.user.email ?? "You",
    canWrite: writePermission ? can(ctx.role, writePermission) : false,
  };
}

/** Org members with their user records (for assignee pickers, team views). */
export async function orgMembers(orgId: string) {
  const rows = await prisma.membership.findMany({
    where: { orgId },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { id: true, name: true, email: true, image: true, designation: true, phone: true, weeklyCapacityHours: true } } },
  });
  return rows.map((m) => ({ ...m.user, role: m.role, joinedAt: m.createdAt }));
}
