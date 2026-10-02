import { prisma } from "@/lib/db";

/**
 * Small server-side lookups shared by the action files and pages.
 * Not a "use server" module; never import from a client component.
 */

/** A project in this org, or throws a user-facing error. */
export async function ownedProject(orgId: string, id: string) {
  const p = await prisma.project.findFirst({ where: { id, orgId }, select: { id: true, name: true, clientId: true } });
  if (!p) throw new Error("Project not found");
  return p;
}

/** Resolve an optional client id, verifying it belongs to the org (IDOR guard). */
export async function ownedClientId(orgId: string, id: string | null): Promise<string | null> {
  if (!id) return null;
  const c = await prisma.client.findFirst({ where: { id, orgId }, select: { id: true } });
  if (!c) throw new Error("Client not found in your organization");
  return c.id;
}

/** Resolve an optional assignee id, verifying membership in the org. */
export async function memberUserId(orgId: string, id: string | null): Promise<string | null> {
  if (!id) return null;
  const m = await prisma.membership.findFirst({ where: { orgId, userId: id }, select: { userId: true } });
  if (!m) throw new Error("Assignee is not a member of this workspace");
  return m.userId;
}

/** Resolve an optional milestone id for a given project. */
export async function projectMilestoneId(orgId: string, projectId: string | null, id: string | null): Promise<string | null> {
  if (!id) return null;
  const m = await prisma.milestone.findFirst({ where: { id, orgId }, select: { id: true, projectId: true } });
  if (!m || (projectId && m.projectId !== projectId)) throw new Error("Milestone not found on this project");
  return m.id;
}

/** Idempotency key if the caller supplied a well-formed one, else null. */
export function optionalIk(fd: FormData): string | null {
  const ik = String(fd.get("ik") ?? "").trim();
  return /^[a-f0-9]{16,64}$/.test(ik) ? ik : null;
}

/** Gross (tax-inclusive) invoice amount in paise from the stored net + GST rate. */
export function invoiceGrossMinor(inv: { amountMinor: number; gstRateBps: number }): number {
  return inv.amountMinor + Math.round((inv.amountMinor * inv.gstRateBps) / 10_000);
}
