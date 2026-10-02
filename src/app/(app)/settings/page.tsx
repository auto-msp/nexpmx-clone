import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { getOrgContext } from "@/lib/tenancy";
import { prisma } from "@/lib/db";
import { planOf } from "@/lib/plans";
import { getOrCreateSubscription, subscriptionView } from "@/lib/subscription";
import { Badge, Button, Card, Field, Input, SectionTitle, Select, Table } from "@/components/ui";
import { generateApiKeyAction } from "@/app/actions/settings";

const SETTINGS_SECTIONS = [
  { href: "/settings/team", label: "Team directory", desc: "Members, roles, invitations, seats" },
  { href: "/settings/plan", label: "Plan & usage", desc: "Current plan, meters, what is left" },
  { href: "/settings/company", label: "Company & GST", desc: "Legal identity on invoices" },
  { href: "/settings/notifications", label: "Notifications", desc: "Org-wide event preferences" },
  { href: "/settings/privacy", label: "Data & privacy", desc: "Data inventory and protections" },
  { href: "/settings/audit", label: "Audit log", desc: "Every mutation, filterable" },
];

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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SETTINGS_SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="rounded-[var(--radius-card)] border border-border bg-surface p-4 transition-colors hover:border-brand"
          >
            <div className="text-sm font-medium">{s.label}</div>
            <div className="mt-0.5 text-xs text-muted">{s.desc}</div>
          </Link>
        ))}
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
