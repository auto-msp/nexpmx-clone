import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { getOrgContext } from "@/lib/tenancy";
import { prisma } from "@/lib/db";
import { storageUsedBytes } from "@/lib/entitlements";
import { Card, SectionTitle, Table } from "@/components/ui";

export const metadata: Metadata = { title: "Data & privacy", robots: { index: false } };

export default async function PrivacyPage() {
  const session = await auth();
  const ctx = await getOrgContext(session!.user!.id);
  const orgId = ctx!.orgId;

  const [clients, projects, invoices, decisions, documents, facts, comms, storageBytes] =
    await Promise.all([
      prisma.client.count({ where: { orgId } }),
      prisma.project.count({ where: { orgId } }),
      prisma.invoice.count({ where: { orgId } }),
      prisma.decision.count({ where: { orgId } }),
      prisma.document.count({ where: { orgId } }),
      prisma.memoryFact.count({ where: { orgId } }),
      prisma.commsMessage.count({ where: { orgId } }),
      storageUsedBytes(orgId),
    ]);

  const rows: Array<[string, number, string]> = [
    ["Clients & contacts", clients, "CRM records for the clients you serve"],
    ["Projects & tasks", projects, "Delivery records and task boards"],
    ["Invoices", invoices, "Billing records (amounts in minor units)"],
    ["Decisions", decisions, "The 'why' behind work, with authors"],
    ["Documents", documents, `Files you uploaded (${(storageBytes / (1024 * 1024)).toFixed(1)} MB)`],
    ["Memory facts", facts, "Business memory the AI reads"],
    ["Comms log", comms, "Emails, calls, meetings and notes you logged"],
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Data &amp; privacy</h1>
        <p className="mt-1 text-sm text-muted">
          What this workspace stores, how it is protected, and where it goes.
        </p>
      </div>

      <Card>
        <SectionTitle>Your data inventory</SectionTitle>
        <div className="mt-4">
          <Table head={["Data", "Records", "What it is"]}>
            {rows.map(([label, count, what]) => (
              <tr key={label}>
                <td className="px-4 py-2.5 font-medium">{label}</td>
                <td className="px-4 py-2.5 text-muted">{count}</td>
                <td className="px-4 py-2.5 text-muted">{what}</td>
              </tr>
            ))}
          </Table>
        </div>
      </Card>

      <Card>
        <SectionTitle>How it is protected</SectionTitle>
        <ul className="mt-3 space-y-2 text-sm text-muted">
          <li>• Every record is org-scoped; cross-tenant access is denied server-side, not just hidden in the UI.</li>
          <li>• Uploads are type-allowlisted, size-capped, and stored outside the webroot with HMAC-signed, 5-minute download links.</li>
          <li>• API keys, invite tokens and portal tokens are stored only as SHA-256 hashes — the raw values are never persisted.</li>
          <li>• AI features read your memory to answer; nothing is used to train shared models.</li>
          <li>• Every mutation is written to an audit log with actor, action and entity.</li>
        </ul>
      </Card>

      <Card>
        <SectionTitle>Your rights</SectionTitle>
        <p className="mt-2 text-sm text-muted">
          The full policy — what we collect, why, how long we keep it, and how to request export or
          deletion — lives on the privacy page. Data is retained while your workspace is active and
          for 30 days after cancellation, then deleted.
        </p>
        <div className="mt-3 flex gap-3 text-sm">
          <a href="/privacy" className="text-brand hover:underline" target="_blank" rel="noopener">
            Read the privacy policy →
          </a>
          <a href="/settings/audit" className="text-brand hover:underline">
            View the audit log →
          </a>
        </div>
      </Card>
    </div>
  );
}
