"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireEntitlement } from "@/lib/entitlements";
import { planOf } from "@/lib/plans";
import { getOrCreateSubscription } from "@/lib/subscription";
import { hashToken } from "@/lib/tenancy";
import { getMailProvider, inviteEmail, appUrl } from "@/lib/mail";
import { runAction, fStr, type ActionResult } from "@/lib/action";

/**
 * Team: invitations, role changes and removals.
 *
 * Invites are single-use capability tokens hashed at rest. The raw token is
 * handed back to the inviting admin through a 60-second httpOnly cookie that
 * the Team directory page reads (show-once), and is also emailed when a mail
 * provider is configured. Seat enforcement runs inside the serializable
 * transaction that inserts the invitation, and again on accept.
 *
 * RBAC: invite / revoke / change role / remove all need org:invite
 * (OWNER or ADMIN). Only an OWNER may touch OWNER or ADMIN memberships.
 */

const INVITE_TTL_DAYS = 7;

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(200),
  role: z.enum(["MEMBER", "MANAGER", "ADMIN"]),
});

function isSerializationError(err: unknown): boolean {
  return (err as { code?: string })?.code === "P2034";
}

export async function inviteMemberAction(formData: FormData): Promise<ActionResult> {
  return runAction("org:invite", async (ctx) => {
    await requireEntitlement(ctx.orgId);

    const parsed = inviteSchema.safeParse({ email: fStr(formData, "email"), role: fStr(formData, "role") || "MEMBER" });
    if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
    const { email, role } = parsed.data;
    if (role === "ADMIN" && ctx.role !== "OWNER") throw new Error("Only an owner can invite an admin.");

    // Already a member?
    const already = await prisma.membership.findFirst({
      where: { orgId: ctx.orgId, user: { email } },
      select: { id: true },
    });
    if (already) throw new Error("That person is already a member of this workspace.");

    const org = await prisma.organization.findUnique({ where: { id: ctx.orgId }, select: { plan: true } });
    const plan = planOf(org?.plan);
    const sub = await getOrCreateSubscription(ctx.orgId);
    const seatCap = sub.state === "ACTIVE" && sub.seats !== null ? sub.seats : plan.maxSeats;

    const raw = `bmi_${randomBytes(24).toString("hex")}`;
    const tokenHash = hashToken(raw);
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000);

    const attempt = async (): Promise<{ created: boolean; inviteId: string }> =>
      prisma.$transaction(
        async (tx) => {
          const existing = await tx.invitation.findFirst({
            where: { orgId: ctx.orgId, email, status: "PENDING", expiresAt: { gt: new Date() } },
          });
          if (existing) {
            const refreshed = await tx.invitation.update({
              where: { id: existing.id },
              data: { tokenHash, role, expiresAt, invitedBy: ctx.userId },
            });
            return { created: false, inviteId: refreshed.id };
          }
          if (seatCap !== null) {
            const [used, pending] = await Promise.all([
              tx.membership.count({ where: { orgId: ctx.orgId } }),
              tx.invitation.count({ where: { orgId: ctx.orgId, status: "PENDING", expiresAt: { gt: new Date() } } }),
            ]);
            if (used + pending >= seatCap) {
              throw new Error(
                `Your plan allows ${seatCap} seats (${used + pending} already in use). Raise the seat count from the Billing page.`,
              );
            }
          }
          const invite = await tx.invitation.create({
            data: { orgId: ctx.orgId, email, role, tokenHash, invitedBy: ctx.userId, expiresAt },
          });
          return { created: true, inviteId: invite.id };
        },
        { isolationLevel: "Serializable" },
      );

    let result: { created: boolean; inviteId: string };
    try {
      result = await attempt();
    } catch (err) {
      if (!isSerializationError(err)) throw err;
      result = await attempt();
    }

    await audit({
      orgId: ctx.orgId,
      actorId: ctx.userId,
      action: result.created ? "member.invited" : "member.reinvited",
      entity: "Invitation",
      entityId: result.inviteId,
      meta: { role }, // email is PII: kept out of audit metadata
    });

    const cookieStore = await cookies();
    cookieStore.set("bm_invite_link", raw, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 300,
    });

    // Best-effort email; failure never blocks onboarding (the link is shown).
    let emailed = false;
    try {
      const [inviter, orgRow] = await Promise.all([
        prisma.user.findUnique({ where: { id: ctx.userId }, select: { name: true } }),
        prisma.organization.findUnique({ where: { id: ctx.orgId }, select: { name: true } }),
      ]);
      const tpl = inviteEmail({
        inviterName: inviter?.name ?? "A teammate",
        orgName: orgRow?.name ?? "the workspace",
        roleName: role,
        inviteUrl: `${appUrl()}/invite/${raw}`,
        expiresOn: expiresAt.toISOString().slice(0, 10),
      });
      const mailResult = await getMailProvider().send({ to: email, subject: tpl.subject, html: tpl.html, text: tpl.text, template: "invite" });
      emailed = Boolean(mailResult.sent);
      await audit({
        orgId: ctx.orgId,
        actorId: ctx.userId,
        action: mailResult.sent ? "member.invite_emailed" : "member.invite_email_failed",
        entity: "Invitation",
        entityId: result.inviteId,
        meta: { provider: mailResult.provider, role },
      });
    } catch (err) {
      console.error("[team] invite email failed (non-fatal)", err);
    }

    revalidatePath("/settings/team");
    return {
      id: result.inviteId,
      message: emailed ? "Invitation emailed. A copy of the link is shown on this page." : "Invitation created. Share the link shown on this page.",
    };
  });
}

/** Clear the show-once invite link once the admin has copied it. */
export async function dismissInviteLinkAction(): Promise<ActionResult> {
  return runAction("org:invite", async () => {
    (await cookies()).delete("bm_invite_link");
    revalidatePath("/settings/team");
    return {};
  });
}

export async function revokeInvitationAction(formData: FormData): Promise<ActionResult> {
  return runAction("org:invite", async (ctx) => {
    const id = fStr(formData, "id");
    const invite = await prisma.invitation.findFirst({ where: { id, orgId: ctx.orgId, status: "PENDING" } });
    if (!invite) throw new Error("Invitation not found");
    await prisma.invitation.update({ where: { id }, data: { status: "REVOKED" } });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "member.invite_revoked", entity: "Invitation", entityId: id });
    revalidatePath("/settings/team");
    return { message: "Invitation revoked" };
  });
}

const roleSchema = z.enum(["OWNER", "ADMIN", "MANAGER", "MEMBER"]);

/** Change a member's role. Guards: not yourself, never leave zero owners, admins cannot touch owners/admins. */
export async function changeMemberRole(formData: FormData): Promise<ActionResult> {
  return runAction("org:invite", async (ctx) => {
    const userId = fStr(formData, "userId");
    const parsed = roleSchema.safeParse(fStr(formData, "role"));
    if (!parsed.success) throw new Error("Choose a valid role");
    const newRole = parsed.data;

    if (userId === ctx.userId) throw new Error("You cannot change your own role. Ask another owner.");
    const target = await prisma.membership.findFirst({ where: { orgId: ctx.orgId, userId } });
    if (!target) throw new Error("Member not found");
    if (target.role === newRole) return { message: "Role unchanged" };

    const privileged = (r: string) => r === "OWNER" || r === "ADMIN";
    if (ctx.role !== "OWNER" && (privileged(target.role) || privileged(newRole))) {
      throw new Error("Only an owner can change owner or admin roles.");
    }
    if (target.role === "OWNER") {
      const owners = await prisma.membership.count({ where: { orgId: ctx.orgId, role: "OWNER" } });
      if (owners <= 1) throw new Error("A workspace needs at least one owner. Promote someone else first.");
    }

    await prisma.membership.update({ where: { id: target.id }, data: { role: newRole } });
    await audit({
      orgId: ctx.orgId,
      actorId: ctx.userId,
      action: "member.role_changed",
      entity: "Membership",
      entityId: target.id,
      meta: { from: target.role, to: newRole, userId },
    });
    revalidatePath("/settings/team");
    return { message: `Role changed to ${newRole.toLowerCase()}` };
  });
}

/** Remove a member. Guards: not yourself, never the last owner, admins cannot remove owners/admins. */
export async function removeMember(formData: FormData): Promise<ActionResult> {
  return runAction("org:invite", async (ctx) => {
    const userId = fStr(formData, "userId");
    if (userId === ctx.userId) throw new Error("You cannot remove yourself from the workspace.");
    const target = await prisma.membership.findFirst({ where: { orgId: ctx.orgId, userId } });
    if (!target) throw new Error("Member not found");

    if (ctx.role !== "OWNER" && (target.role === "OWNER" || target.role === "ADMIN")) {
      throw new Error("Only an owner can remove owners or admins.");
    }
    if (target.role === "OWNER") {
      const owners = await prisma.membership.count({ where: { orgId: ctx.orgId, role: "OWNER" } });
      if (owners <= 1) throw new Error("You cannot remove the last owner.");
    }

    await prisma.$transaction([
      prisma.task.updateMany({ where: { orgId: ctx.orgId, assigneeId: userId }, data: { assigneeId: null } }),
      prisma.membership.delete({ where: { id: target.id } }),
    ]);
    await audit({
      orgId: ctx.orgId,
      actorId: ctx.userId,
      action: "member.removed",
      entity: "Membership",
      entityId: target.id,
      meta: { role: target.role, userId },
    });
    revalidatePath("/settings/team");
    return { message: "Member removed", redirect: "/settings/team" };
  });
}
