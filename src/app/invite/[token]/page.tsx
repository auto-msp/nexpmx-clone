import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/tenancy";
import { planOf } from "@/lib/plans";
import { audit } from "@/lib/audit";
import { Badge, ButtonLink, Card } from "@/components/ui";
import { seatsInUse } from "@/lib/seats";

export const metadata: Metadata = { title: "Join your team", robots: { index: false } };

/**
 * Invitation acceptance — capability-token flow like the client portal.
 * The raw token in the URL is hashed and looked up; the invite must be
 * pending and unexpired; the signed-in user's email must match; and the
 * org's seat cap is re-checked transactionally before the membership is
 * created (RULE-ENT-05).
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (!/^bmi_[a-f0-9]{48}$/.test(token)) {
    return <InviteError message="This invite link is not valid." />;
  }

  const invite = await prisma.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { org: { select: { id: true, name: true, plan: true } } },
  });

  if (!invite || invite.status !== "PENDING" || invite.expiresAt <= new Date()) {
    return <InviteError message="This invite link is not valid." />;
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (!session?.user?.email || !userId) {
    return <InviteError message="Log in with Google first, then reopen this invite link." />;
  }

  const email = session.user.email.toLowerCase();
  if (email !== invite.email) {
    return (
      <InviteFrame>
        <h1 className="text-xl font-semibold">Wrong account</h1>
        <p className="mt-3 text-sm text-muted">
          This invite was sent to <span className="font-medium">{invite.email}</span> but
          you are signed in as <span className="font-medium">{email}</span>. Sign in with
          the invited address and reopen the link.
        </p>
      </InviteFrame>
    );
  }

  const orgId = invite.org.id;

  // Seat re-check at accept time — pending invites may have consumed the
  // last seat between invite creation and acceptance.
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { plan: true },
  });
  const plan = planOf(org?.plan);
  if (plan.maxSeats !== null) {
    const used = await seatsInUse(orgId);
    if (used >= plan.maxSeats) {
      return (
        <InviteFrame>
          <h1 className="text-xl font-semibold">No seats left</h1>
          <p className="mt-3 text-sm text-muted">
            The {plan.name} plan allows {plan.maxSeats} seats and they are all in
            use. Ask an admin to free a seat or upgrade the plan.
          </p>
        </InviteFrame>
      );
    }
  }

  // Already a member? Consume the invite and confirm.
  const existingMembership = await prisma.membership.findFirst({
    where: { userId, orgId },
  });
  if (existingMembership) {
    await prisma.invitation.update({
      where: { id: invite.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });
    return (
      <InviteFrame>
        <h1 className="text-xl font-semibold">You're already on the team</h1>
        <p className="mt-3 text-sm text-muted">
          Your access to {invite.org.name} is active.{" "}
          <a href="/dashboard" className="text-brand hover:underline">Go to your workspace →</a>
        </p>
      </InviteFrame>
    );
  }

  await prisma.$transaction([
    prisma.membership.create({
      data: { userId, orgId, role: invite.role },
    }),
    prisma.invitation.update({
      where: { id: invite.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    }),
  ]);

  await audit({
    orgId,
    actorId: userId,
    action: "member.joined",
    entity: "Membership",
    meta: { role: invite.role },
  });

  return (
    <InviteFrame>
      <h1 className="text-xl font-semibold">Welcome to {invite.org.name}</h1>
      <p className="mt-3 text-sm text-muted">
        You joined as <Badge tone="brand">{invite.role}</Badge>.{" "}
        <a href="/dashboard" className="text-brand hover:underline">Open your workspace →</a>
      </p>
    </InviteFrame>
  );
}

function InviteFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-md px-4 py-24">
      <Card>{children}</Card>
    </main>
  );
}

function InviteError({ message }: { message: string }) {
  return (
    <InviteFrame>
      <h1 className="text-xl font-semibold">Invite unavailable</h1>
      <p className="mt-3 text-sm text-muted">{message}</p>
    </InviteFrame>
  );
}
