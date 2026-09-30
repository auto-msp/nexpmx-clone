import type { Metadata } from "next";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { getOrgContext } from "@/lib/tenancy";
import { prisma } from "@/lib/db";
import { planOf } from "@/lib/plans";
import { getOrCreateSubscription, subscriptionView } from "@/lib/subscription";
import { Badge, Button, Card, Field, Input, SectionTitle, Select, Table } from "@/components/ui";
import { generateApiKeyAction } from "@/app/actions/settings";
import { inviteMemberAction } from "@/app/actions/team";

export const metadata: Metadata = { title: "Settings", robots: { index: false } };

export default async function SettingsPage() {
  const session = await auth();
  const ctx = await getOrgContext(session!.user!.id);

  const org = await prisma.organization.findUnique({
    where: { id: ctx!.orgId },
    select: { name: true, slug: true, plan: true, brandColor: true },
  });
  const plan = planOf(org?.plan);
  const sub = await getOrCreateSubscription(ctx!.orgId);
  const trial = subscriptionView(sub);

  // One-time invite link (set by inviteMemberAction, cleared on read).
  const cookieStore = await cookies();
  const inviteLink = cookieStore.get("bm_invite_link")?.value ?? null;
  if (inviteLink) {
    try {
      cookieStore.delete("bm_invite_link");
    } catch {
      // Non-fatal: cookie expires in 60s anyway.
    }
  }

  const logs = await prisma.auditLog.findMany({
    where: { orgId: ctx!.orgId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted">Workspace, plan and security.</p>
      </div>

      <Card>
        <SectionTitle>Workspace</SectionTitle>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-muted">Name</dt><dd className="font-medium">{org?.name}</dd></div>
          <div><dt className="text-muted">Slug</dt><dd className="font-medium">{org?.slug}</dd></div>
          <div>
            <dt className="text-muted">Plan</dt>
            <dd>
              <Badge tone="brand">{plan.name}</Badge>{" "}
              {trial.state === "TRIALING" && !trial.expired ? (
                <span className="text-xs text-muted">
                  Trial — {trial.daysRemaining} {trial.daysRemaining === 1 ? "day" : "days"} left
                  {trial.trialEndsAt ? ` (ends ${trial.trialEndsAt.toISOString().slice(0, 10)})` : ""}
                </span>
              ) : null}
            </dd>
          </div>
          <div><dt className="text-muted">Your role</dt><dd className="font-medium">{ctx!.role}</dd></div>
        </dl>
      </Card>

      {inviteLink ? (
        <Card className="border-brand/50">
          <SectionTitle>Invitation ready — share it now</SectionTitle>
          <p className="mt-2 text-sm text-muted">
            This link works once, for the invited address, and expires in 7 days.
            It will not be shown again — copy it now.
          </p>
          <code className="mt-3 block overflow-x-auto rounded-[var(--radius-control)] border border-border bg-surface-2 px-3 py-2 text-sm">
            {inviteLink.startsWith("/") ? inviteLink : `/invite/${inviteLink}`}
          </code>
        </Card>
      ) : null}

      <TeamSection orgId={ctx!.orgId} role={ctx!.role} />

      <Card>
        <SectionTitle>API access</SectionTitle>
        <p className="mt-2 text-sm text-muted">
          Generate a scoped API key for programmatic access. The full key is shown
          once and stored only as a SHA-256 hash.
        </p>
        <form action={generateApiKeyAction} className="mt-4">
          <button
            type="submit"
            className="rounded-[var(--radius-control)] border border-border bg-surface-2 px-4 py-2 text-sm font-medium hover:border-brand"
          >
            Generate new API key
          </button>
        </form>
        <ApiKeyList orgId={ctx!.orgId} />
      </Card>

      <Card>
        <SectionTitle>Recent audit log</SectionTitle>
        <div className="mt-4">
          <Table head={["When", "Actor", "Action", "Entity"]}>
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-2.5 text-muted">{l.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                <td className="px-4 py-2.5 text-muted">{l.actorId ? "member" : "system"}</td>
                <td className="px-4 py-2.5 font-medium">{l.action}</td>
                <td className="px-4 py-2.5 text-muted">{l.entity}</td>
              </tr>
            ))}
            {logs.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-4 text-center text-muted">No events yet</td></tr>
            ) : null}
          </Table>
        </div>
      </Card>
    </div>
  );
}

async function TeamSection({ orgId, role }: { orgId: string; role: string }) {
  const [members, pending] = await Promise.all([
    prisma.membership.findMany({
      where: { orgId },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { name: true, email: true } } },
    }),
    prisma.invitation.findMany({
      where: { orgId, status: "PENDING", expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return (
    <Card>
      <SectionTitle>Team</SectionTitle>
      <div className="mt-4">
        <Table head={["Member", "Role", "Since"]}>
          {members.map((m) => (
            <tr key={m.id}>
              <td className="px-4 py-2.5">
                <div className="font-medium">{m.user.name ?? "—"}</div>
                <div className="text-xs text-muted">{m.user.email}</div>
              </td>
              <td className="px-4 py-2.5"><Badge tone="neutral">{m.role}</Badge></td>
              <td className="px-4 py-2.5 text-muted">{m.createdAt.toISOString().slice(0, 10)}</td>
            </tr>
          ))}
        </Table>
      </div>
      {pending.length > 0 ? (
        <div className="mt-6">
          <h3 className="text-sm font-medium">Pending invitations</h3>
          <ul className="mt-2 space-y-1.5 text-sm text-muted">
            {pending.map((i) => (
              <li key={i.id}>
                {i.email} — <Badge tone="warn">{i.role}</Badge> · expires{" "}
                {i.expiresAt.toISOString().slice(0, 10)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <InviteForm orgId={orgId} role={role} seatUsed={members.length} />
    </Card>
  );
}

function InviteForm({ orgId, role, seatUsed }: { orgId: string; role: string; seatUsed: number }) {
  const canInvite = role === "OWNER" || role === "ADMIN";
  if (!canInvite) {
    return <p className="mt-6 text-xs text-muted">Only owners and admins can invite teammates.</p>;
  }
  return (
    <form action={inviteMemberAction} className="mt-6 flex flex-wrap items-end gap-3">
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
      <Button type="submit">Invite</Button>
    </form>
  );
}

async function ApiKeyList({ orgId }: { orgId: string }) {
  const keys = await prisma.apiKey.findMany({
    where: { orgId, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (keys.length === 0) return null;
  return (
    <ul className="mt-4 space-y-1.5 text-sm text-muted">
      {keys.map((k) => (
        <li key={k.id}>
          <span className="font-mono text-text">{k.prefix}…</span> created{" "}
          {k.createdAt.toISOString().slice(0, 10)}
        </li>
      ))}
    </ul>
  );
}
