import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { getOrgContext } from "@/lib/tenancy";
import { prisma } from "@/lib/db";
import { canRead } from "@/lib/rbac";
import { Badge, Button, Card, EmptyState, Field, Input, SectionTitle, Table } from "@/components/ui";
import { createClient, archiveClient } from "@/app/actions/clients";

export const metadata: Metadata = { title: "Clients", robots: { index: false } };

export default async function ClientsPage() {
  const session = await auth();
  const ctx = await getOrgContext(session!.user!.id);
  if (!canRead(ctx!.role)) throw new Error("Forbidden");

  const clients = await prisma.client.findMany({
    where: { orgId: ctx!.orgId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { projects: true, invoices: true } } },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
        <p className="mt-1 text-sm text-muted">
          Every client in one place — the root of your business memory.
        </p>
      </div>

      <Card>
        <SectionTitle>Add a client</SectionTitle>
        <form action={createClient} className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Name *">
            <Input name="name" required maxLength={120} placeholder="Acme Corp" />
          </Field>
          <Field label="Company">
            <Input name="company" maxLength={120} placeholder="Optional" />
          </Field>
          <Field label="Email">
            <Input name="email" type="email" maxLength={200} placeholder="billing@acme.com" />
          </Field>
          <Field label="Phone">
            <Input name="phone" maxLength={40} placeholder="+91 …" />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit">Create client</Button>
          </div>
        </form>
      </Card>

      <section aria-labelledby="client-list">
        <h2 id="client-list" className="sr-only">Client list</h2>
        {clients.length === 0 ? (
          <EmptyState title="No clients yet" hint="Add your first client above to get started." />
        ) : (
          <Table head={["Client", "Projects", "Invoices", "Status", ""]}>
            {clients.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3">
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-muted">{c.email ?? c.company ?? "—"}</div>
                </td>
                <td className="px-4 py-3 text-muted">{c._count.projects}</td>
                <td className="px-4 py-3 text-muted">{c._count.invoices}</td>
                <td className="px-4 py-3">
                  <Badge tone={c.status === "ACTIVE" ? "success" : "neutral"}>{c.status}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  {c.status === "ACTIVE" ? (
                    <form action={archiveClient}>
                      <input type="hidden" name="id" value={c.id} />
                      <Button variant="ghost" type="submit">Archive</Button>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </section>
    </div>
  );
}
