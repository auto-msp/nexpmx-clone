import { prisma } from "@/lib/db";

/**
 * Seat accounting (BUSINESS_RULES.md RULE-ENT-05).
 *
 * A seat is consumed by every accepted member AND every live invitation
 * (pending + unexpired) — otherwise N invites could be outstanding against
 * one remaining seat. Revoked/accepted/expired invitations free their seat.
 *
 * Lives in lib/ (not the "use server" action module) so tests and future
 * runners can import it without pulling server-action machinery in.
 */
export async function seatsInUse(orgId: string): Promise<number> {
  const [members, pending] = await Promise.all([
    prisma.membership.count({ where: { orgId } }),
    prisma.invitation.count({
      where: {
        orgId,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
    }),
  ]);
  return members + pending;
}
