import type { Metadata } from "next";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { getOrgContext } from "@/lib/tenancy";
import { prisma } from "@/lib/db";
import { planOf } from "@/lib/plans";
import { Badge, Card, Field, Input, SectionTitle, Select, Table } from "@/components/ui";
import { inviteMemberAction } from "@/app/actions/team";
import { SubmitButton } from "@/components/submit-button";

export const metadata: Metadata = { title: "Team directory", robots: { index: false } };

export default async function TeamDirectoryPage() {
  const session = await auth();
  const ctx = await getOrgContext(session!.user!.id);
  const orgId = ctx!.orgId;

  const [members, pending, org] = await Promise.all([
    prisma.membership.findMany({
      where: { orgId },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { name: true, email: true, image: true } } },
    }),
    prisma.invitation.findMany({
      where: { orgId, status: "PENDING", expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.organization.findUnique({ where: { id: orgId }, select: { plan: true } }),
  ]);

  const plan = planOf(org?.plan);
  const seatCap = plan.maxSeats;
  const seatsUsed = members.length + pending.length;
  const inviteLink = (await cookies()).get("bm_invite_link")?.value ?? null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Team directory</h1>
        <p className="mt-1 text-sm text-muted">
          Everyone with access to this workspace, and every invitation still open.
        </p>
      </div>

      {inviteLink ? (
        <Card className="border-brand/50">
          <SectionTitle>Invitation ready — share it now</SectionTitle>
          <p className="mt-2 text-sm text-muted">
            This link works once, for the invited address, and expires in 7 days. It will not be
            shown again — copy it now.
          </p>
          <code className="mt-3 block overflow-x-auto rounded-[var(--radius-control)] border border-border bg-surface-2 px-3 py-2 text-sm">
            {inviteLink.startsWith("/") ? inviteLink : `/invite/${inviteLink}`}
          </code>
        </Card>
      ) : null}

      <Card>
        <div className="flex items-center justify-between gap-3">
          <SectionTitle>Members ({members.length})</SectionTitle>
          <Badge tone={seatCap !== null && seatsUsed >= seatCap ? "danger" : "neutral"}>
            {seatsUsed} / {seatCap ?? "∞"} seats (incl. pending)
          </Badge>
        </div>
        <div className="mt-4">
          <Table head={["Member", "Role", "Joined", "Status"]}>
            {members.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-full bg-brand/20 text-xs font-semibold text-brand">
                      {(m.user.name ?? m.user.email).charAt(0).toUpperCase()}
                    </span>
                    <div>
                      <div className="font-medium">{m.user.name ?? "—"}</div>
                      <div className="text-xs text-muted">{m.user.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2.5"><Badge tone={m.role === "OWNER" ? "brand" : "neutral"}>{m.role}</Badge></td>
                <td className="px-4 py-2.5 text-muted">{m.createdAt.toISOString().slice(0, 10)}</td>
                <td className="px-4 py-2.5"><Badge tone="success">active</Badge></td>
              </tr>
            ))}
          </Table>
        </div>
      </Card>

      {pending.length > 0 ? (
        <Card>
          <SectionTitle>Pending invitations ({pending.length})</SectionTitle>
          <ul className="mt-3 space-y-2 text-sm">
            {pending.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2">
                <span>
                  {i.email} <Badge tone="warn">{i.role}</Badge>
                </span>
                <span className="text-xs text-muted">
                  expires {i.expiresAt.toISOString().slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <SectionTitle>Invite a teammate</SectionTitle>
        <InviteForm role={ctx!.role} seatsLeft={seatCap === null ? null : Math.max(0, seatCap - seatsUsed)} />
        <p className="mt-3 text-xs text-muted">
          No email is sent — the one-time link is shown after you invite and must be shared by hand
          (see KNOWN_LIMITATIONS).
        </p>
      </Card>
    </div>
  );
}

function InviteForm({ role, seatsLeft }: { role: string; seatsLeft: number | null }) {
  const canInvite = role === "OWNER" || role === "ADMIN";
  if (!canInvite) {
    return <p className="mt-4 text-xs text-muted">Only owners and admins can invite teammates.</p>;
  }
  if (seatsLeft === 0) {
    return (
      <p className="mt-4 text-xs text-warn">
        All seats are used (including pending invitations). Upgrade the plan or revoke an invitation
        first.
      </p>
    );
  }
  return (
    <form action={inviteMemberAction} className="mt-4 flex flex-wrap items-end gap-3">
      <div className="min-w-48 flex-1">
        <Field label="Teammate email">
          <Input name="email" type="email" required maxLength={200} placeholder="teammate@studio.com" />
        </Field>
      </div>
      <div className="w-40">
        <Field label="Role">
          <Select name="role" defaultValue="MEMBER">
            <option value="MEMBER">Member</option>
            <option value="MANAGER">Manager</option>
            <option value="ADMIN">Admin</option>
          </Select>
        </Field>
      </div>
      <SubmitButton pendingLabel="Inviting…">Invite</SubmitButton>
    </form>
  );
}
