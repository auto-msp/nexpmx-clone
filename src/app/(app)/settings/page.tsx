import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { getOrgContext } from "@/lib/tenancy";
import { prisma } from "@/lib/db";
import { planOf } from "@/lib/plans";
import { Badge, Card, SectionTitle, Table } from "@/components/ui";
import { generateApiKeyAction } from "@/app/actions/settings";

export const metadata: Metadata = { title: "Settings", robots: { index: false } };

export default async function SettingsPage() {
  const session = await auth();
  const ctx = await getOrgContext(session!.user!.id);

  const org = await prisma.organization.findUnique({
    where: { id: ctx!.orgId },
    select: { name: true, slug: true, plan: true, brandColor: true },
  });
  const plan = planOf(org?.plan);

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
          <div><dt className="text-muted">Plan</dt><dd><Badge tone="brand">{plan.name}</Badge></dd></div>
          <div><dt className="text-muted">Your role</dt><dd className="font-medium">{ctx!.role}</dd></div>
        </dl>
      </Card>

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
