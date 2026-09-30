import { prisma } from "@/lib/db";
import { createHash, randomBytes } from "node:crypto";

/**
 * Tenancy helpers.
 *
 * Every server-side data access goes through these guards so that tenant
 * isolation is enforced in ONE place rather than scattered per-page
 * (SECURITY.md §IDOR).
 */

export interface OrgContext {
  userId: string;
  orgId: string;
  role: string;
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "")
      .slice(0, 40) || "org"
  );
}

export function newPortalToken(): string {
  // 32 hex chars; acts as a bearer capability for the client portal.
  return randomBytes(16).toString("hex");
}

/** Hash portal tokens before lookup/audit so DB leaks don't leak capabilities. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Get the caller's active org context, or null when unauthenticated. */
export async function getOrgContext(
  userId: string | undefined | null,
): Promise<OrgContext | null> {
  if (!userId) return null;
  const membership = await prisma.membership.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: { org: { select: { id: true, plan: true } } },
  });
  if (!membership) return null;
  return {
    userId,
    orgId: membership.orgId,
    role: membership.role,
  };
}

/** Org context or throw 401 — for API routes. */
export async function requireOrgContext(userId: string | null | undefined) {
  const ctx = await getOrgContext(userId);
  if (!ctx) {
    const err = new Error("No organization membership") as Error & { status?: number };
    err.status = 401;
    throw err;
  }
  return ctx;
}

/**
 * Create the user's default organization on first sign-in.
 * OWNER promotion is controlled by the OWNER_EMAILS allowlist.
 */
export async function ensureDefaultOrgForUser(email: string, name: string | null) {
  const user = await prisma.user.upsert({
    where: { email },
    update: { name },
    create: { email, name },
  });

  const existing = await prisma.membership.findFirst({
    where: { userId: user.id },
  });
  if (existing) return user;

  const ownerEmails = (process.env.OWNER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const isOwner = ownerEmails.includes(email.toLowerCase());

  const org = await prisma.organization.create({
    data: {
      name: name ? `${name.split(" ")[0]}'s Workspace` : "My Workspace",
      slug: `${slugify(name ?? "my")}-${randomBytes(3).toString("hex")}`,
    },
  });

  await prisma.membership.create({
    data: {
      userId: user.id,
      orgId: org.id,
      role: isOwner ? "OWNER" : "MEMBER",
    },
  });

  await prisma.auditLog.create({
    data: {
      orgId: org.id,
      actorId: user.id,
      action: "org.created",
      entity: "Organization",
      entityId: org.id,
    },
  });

  return user;
}
