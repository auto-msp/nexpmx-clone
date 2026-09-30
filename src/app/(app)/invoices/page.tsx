import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { getOrgContext } from "@/lib/tenancy";
import { prisma } from "@/lib/db";
import { Badge, Button, Card, EmptyState, Field, Input, SectionTitle, Select, Table } from "@/components/ui";
import { createInvoice, transitionInvoice } from "@/app/actions/invoices";
import { formatInr } from "@/lib/plans";

export const metadata: Metadata = { title: "Invoices", robots: { index: false } };

const TONE: Record<string, "neutral" | "success" | "warn" | "danger" | "brand"> = {
  DRAFT: "neutral",
  SENT: "brand",
  PAID: "success",
  OVERDUE: "danger",
};

export default async function InvoicesPage() {
  const session = await auth();
  const ctx = await getOrgContext(session!.user!.id);

  const invoices = await prisma.invoice.findMany({
    where: { orgId: ctx!.orgId },
    orderBy: { createdAt: "desc" },
    include: { client: { select: { name: true } } },
  });

  const clients = await prisma.client.findMany({
    where: { orgId: ctx!.orgId, status: "ACTIVE" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const nextActions: Record<string, Array<{ to: string; label: string }>> = {
    DRAFT: [{ to: "SENT", label: "Send" }],
    SENT: [{ to: "PAID", label: "Mark paid" }],
    OVERDUE: [{ to: "PAID", label: "Mark paid" }],
    PAID: [],
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
        <p className="mt-1 text-sm text-muted">
          Draft → Sent → Paid. Overdue is applied automatically to sent invoices past due.
        </p>
      </div>

      <Card>
        <SectionTitle>New invoice</SectionTitle>
        <form action={createInvoice} className="mt-4 grid gap-4 sm:grid-cols-4">
          <Field label="Client *">
            <Select name="clientId" required defaultValue="">
              <option value="" disabled>Choose…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Number *">
            <Input name="number" required maxLength={40} placeholder="INV-001" />
          </Field>
          <Field label="Amount (INR) *">
            <Input name="amount" type="number" min="1" step="0.01" required placeholder="15000" />
          </Field>
          <Field label="Due date">
            <Input name="dueAt" type="date" />
          </Field>
          <div className="sm:col-span-4">
            <Button type="submit">Create draft</Button>
          </div>
        </form>
      </Card>

      {invoices.length === 0 ? (
        <EmptyState title="No invoices yet" hint="Create a draft above, then send it." />
      ) : (
        <Table head={["Number", "Client", "Amount", "Due", "Status", "Actions"]}>
          {invoices.map((inv) => (
            <tr key={inv.id}>
              <td className="px-4 py-3 font-medium">{inv.number}</td>
              <td className="px-4 py-3 text-muted">{inv.client.name}</td>
              <td className="px-4 py-3">{formatInr(inv.amountMinor)}</td>
              <td className="px-4 py-3 text-muted">
                {inv.dueAt ? inv.dueAt.toISOString().slice(0, 10) : "—"}
              </td>
              <td className="px-4 py-3">
                <Badge tone={TONE[inv.status] ?? "neutral"}>{inv.status}</Badge>
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-2">
                  {(nextActions[inv.status] ?? []).map((a) => (
                    <form key={a.to} action={transitionInvoice}>
                      <input type="hidden" name="id" value={inv.id} />
                      <input type="hidden" name="status" value={a.to} />
                      <Button variant="secondary" type="submit">{a.label}</Button>
                    </form>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
