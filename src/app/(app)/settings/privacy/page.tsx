import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { pageContext } from "@/lib/page";
import { storageUsedBytes } from "@/lib/entitlements";
import { fmtDate } from "@/lib/format";
import { PageHeader, Panel, EmptyPanel } from "@/components/kit";
import { ActionForm, ActionButton } from "@/components/kit-client";
import { Field, Input, Table } from "@/components/ui";
import { createApiKey, revokeApiKey } from "@/app/actions/settings";

export const metadata: Metadata = { title: "Data & privacy", robots: { index: false } };

export default async function PrivacyPage() {
  const { orgId, canWrite: canKeys } = await pageContext("org:invite");

  const [clients, projects, invoices, decisions, documents, facts, comms, storageBytes, keys] = await Promise.all([
    prisma.client.count({ where: { orgId } }),
    prisma.project.count({ where: { orgId } }),
    prisma.invoice.count({ where: { orgId } }),
    prisma.decision.count({ where: { orgId } }),
    prisma.document.count({ where: { orgId } }),
    prisma.memoryFact.count({ where: { orgId } }),
    prisma.commsMessage.count({ where: { orgId } }),
    storageUsedBytes(orgId),
    prisma.apiKey.findMany({ where: { orgId, revokedAt: null }, orderBy: { createdAt: "desc" }, select: { id: true, name: true, prefix: true, createdAt: true } }),
  ]);

  const rows: Array<[string, number, string]> = [
    ["Clients & contacts", clients, "CRM records for the clients you serve"],
    ["Projects & tasks", projects, "Delivery records and task boards"],
    ["Invoices", invoices, "Billing records, with amounts held in paise"],
    ["Decisions", decisions, "The reasoning behind work, with authors"],
    ["Documents", documents, `Files you uploaded (${(storageBytes / (1024 * 1024)).toFixed(1)} MB)`],
    ["Memory facts", facts, "Business memory the AI reads"],
    ["Comms log", comms, "Emails, calls, meetings and notes you logged"],
  ];

  return (
    <>
      <PageHeader title="Data & privacy" subtitle="What this workspace stores, how it is protected and how to get at it." />

      <div className="space-y-6">
        <Panel title="Your data inventory" flush>
          <Table head={["Data", "Records", "What it is"]}>
            {rows.map(([label, count, what]) => (
              <tr key={label}>
                <td className="px-4 py-2.5 font-medium">{label}</td>
                <td className="px-4 py-2.5 tabular-nums text-muted">{count.toLocaleString("en-IN")}</td>
                <td className="px-4 py-2.5 text-muted">{what}</td>
              </tr>
            ))}
          </Table>
        </Panel>

        <Panel title="API access">
          <p className="mb-4 text-sm text-muted">Keys let scripts and integrations read and write this workspace. A key is shown once when created and stored only as a hash.</p>
          {canKeys ? (
            <ActionForm action={createApiKey} submitLabel="Create key" pendingLabel="Creating…">
              <Field label="Key name">
                <Input name="name" maxLength={60} placeholder="Zapier integration" />
              </Field>
            </ActionForm>
          ) : (
            <p className="rounded-[var(--radius-control)] bg-surface-2 px-3 py-2 text-xs text-muted">Only owners and admins can create API keys.</p>
          )}
          <div className="mt-5">
            {keys.length === 0 ? (
              <EmptyPanel icon="link" title="No active keys" hint="Create a key above when you need programmatic access." />
            ) : (
              <ul className="divide-y divide-border rounded-[var(--radius-card)] border border-border">
                {keys.map((k) => (
                  <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                    <span>
                      <span className="font-medium">{k.name}</span>{" "}
                      <span className="font-mono text-xs text-muted">{k.prefix}…</span>
                      <span className="block text-xs text-muted">Created {fmtDate(k.createdAt)}</span>
                    </span>
                    {canKeys ? <ActionButton action={revokeApiKey} fields={{ id: k.id }} label="Revoke" variant="danger" confirm="Revoke this key? Anything using it will stop working." /> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>

        <Panel title="How it is protected">
          <ul className="space-y-2 text-sm text-muted">
            <li>Every record belongs to one workspace. Cross-workspace access is denied on the server, not just hidden in the UI.</li>
            <li>Uploads are type-checked and size-capped, kept outside the web root, and downloaded through short-lived signed links.</li>
            <li>API keys, invitation links and portal links are stored only as hashes. The raw values are never saved.</li>
            <li>AI features read your memory to answer. Nothing here is used to train shared models.</li>
            <li>Every change is written to the audit log with who, what and when.</li>
          </ul>
        </Panel>

        <Panel title="Your rights">
          <p className="text-sm text-muted">
            The full policy covers what we collect, why, how long it is kept and how to ask for an export or deletion. Data is retained while your workspace is active and for 30 days after cancellation, then deleted.
          </p>
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <a href="/privacy" className="text-brand hover:underline" target="_blank" rel="noopener">
              Read the privacy policy
            </a>
            <Link href="/settings/audit" className="text-brand hover:underline">
              View the audit log
            </Link>
          </div>
        </Panel>
      </div>
    </>
  );
}
