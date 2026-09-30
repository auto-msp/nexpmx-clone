"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireApiContext } from "@/lib/api";
import { requirePermission } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { requireEntitlement } from "@/lib/entitlements";
import { planOf } from "@/lib/plans";
import { hashToken } from "@/lib/tenancy";
import { seatsInUse } from "@/lib/seats";
import { randomBytes } from "node:crypto";

/**
 * Team invitations (KNOWN_LIMITATIONS #3 / #9).
 *
 * Model: single-use capability tokens, hashed at rest like API keys. The raw
 * token exists only inside the invite URL, which today is surfaced to the
 * inviting admin (email delivery is out of scope until a mail provider
 * lands — see KNOWN_LIMITATIONS).
 *
 * Seat enforcement happens at BOTH ends (BUSINESS_RULES RULE-ENT-05):
 * - invite time: pending invites + accepted members cannot exceed maxSeats
 * - accept time: re-counted transactionally before the membership insert
 */

const INVITE_TTL_DAYS = 7;

const inviteSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email")
    .max(200),
  role: z.enum(["MEMBER", "MANAGER", "ADMIN"]),
});



export async function inviteMemberAction(formData: FormData): Promise<void> {
  const ctx = await requireApiContext();
  requirePermission(ctx.role, "org:invite"); // OWNER or ADMIN only
  await requireEntitlement(ctx.orgId);

  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role") || "MEMBER",
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }
  const { email, role } = parsed.data;

  // Seat cap at invite time (plan.maxSeats; null = unlimited).
  const org = await prisma.organization.findUnique({
    where: { id: ctx.orgId },
    select: { plan: true },
  });
  const plan = planOf(org?.plan);
  if (plan.maxSeats !== null) {
    const used = await seatsInUse(ctx.orgId);
    if (used >= plan.maxSeats) {
      throw new Error(
        `Your ${plan.name} plan allows ${plan.maxSeats} seats (${used} already in use). Upgrade to invite more teammates.`,
      );
    }
  }

  // Idempotent-ish: an existing live invite for the same email is refreshed
  // instead of piling up duplicates.
  const existing = await prisma.invitation.findFirst({
    where: {
      orgId: ctx.orgId,
      email,
      status: "PENDING",
      expiresAt: { gt: new Date() },
    },
  });

  const raw = `bmi_${randomBytes(24).toString("hex")}`;
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000);

  let invite;
  if (existing) {
    invite = await prisma.invitation.update({
      where: { id: existing.id },
      data: { tokenHash, role, expiresAt, invitedBy: ctx.userId },
    });
  } else {
    invite = await prisma.invitation.create({
      data: {
        orgId: ctx.orgId,
        email,
        role,
        tokenHash,
        invitedBy: ctx.userId,
        expiresAt,
      },
    });
  }

  await audit({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    action: existing ? "member.reinvited" : "member.invited",
    entity: "Invitation",
    entityId: invite.id,
    meta: { role }, // email is PII — kept out of audit metadata
  });

  // One-time display: the raw token is handed back to the inviting admin via
  // a short-lived httpOnly cookie that the settings page reads and clears —
  // the same show-once contract as API keys. Never persisted in plaintext.
  const cookieStore = await cookies();
  cookieStore.set("bm_invite_link", raw, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60,
  });

  revalidatePath("/settings");
}

export async function revokeInvitationAction(formData: FormData): Promise<void> {
  const ctx = await requireApiContext();
  requirePermission(ctx.role, "org:invite");

  const id = String(formData.get("id") ?? "");
  const invite = await prisma.invitation.findFirst({
    where: { id, orgId: ctx.orgId, status: "PENDING" },
  });
  if (!invite) throw new Error("Invitation not found");

  await prisma.invitation.update({
    where: { id },
    data: { status: "REVOKED" },
  });

  await audit({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    action: "member.invite_revoked",
    entity: "Invitation",
    entityId: id,
  });

  revalidatePath("/settings");
}
