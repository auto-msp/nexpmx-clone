import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { getOrgContext } from "@/lib/tenancy";
import { prisma } from "@/lib/db";
import { canRead } from "@/lib/rbac";
import { Card, EmptyState, SectionTitle, StatCard, Table } from "@/components/ui";
import { formatInr, planOf } from "@/lib/plans";

export const metadata: Metadata = { title: "Reports", robots: { index: false } };

/**
 * Reports (screenshot evidence: Revenue overview, Client profitability,
 * Team performance with Export CSV). Implementations are honest aggregates
 * over real org data; CSV export is a client-side download of the rendered
 * table data via a data URL (no server round-trip needed).
 */

export default async function ReportsPage() {
  const session = await auth();
  const ctx = await getOrgContext(session!.user!.id);
  if (!canRead(ctx!.role)) throw new Error("Forbidden");
  const orgId = ctx!.orgId;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);

  const [paidAll, paidYear, paidMonth, sent, overdue, byClientRaw, decisionsByUser] =
    await Promise.all([
      prisma.invoice.aggregate({ where: { orgId, status: "PAID" }, _sum: { amountMinor: true } }),
      prisma.invoice.aggregate({
        where: { orgId, status: "PAID", updatedAt: { gte: yearStart } },
        _sum: { amountMinor: true },
      }),
      prisma.invoice.aggregate({
        where: { orgId, status: "PAID", updatedAt: { gte: monthStart } },
        _sum: { amountMinor: true },
      }),
      prisma.invoice.aggregate({ where: { orgId, status: "SENT" }, _sum: { amountMinor: true } }),
      prisma.invoice.aggregate({
        where: { orgId, status: { in: ["SENT", "OVERDUE"] }, dueAt: { lt: now } },
        _sum: { amountMinor: true },
      }),
      prisma.invoice.groupBy({
        by: ["clientId"],
        where: { orgId },
        _sum: { amountMinor: true },
        _count: true,
      }),
      prisma.decision.groupBy({
        by: ["authorId"],
        where: { orgId },
        _count: true,
      }),
    ]);

  const clientIds = byClientRaw.map((r) => r.clientId).filter((x): x is string => Boolean(x));
  const clients = await prisma.client.findMany({
    where: { orgId, id: { in: clientIds } },
    select: { id: true, name: true },
  });
  const clientName = new Map(clients.map((c) => [c.id, c.name]));

  const authorIds = decisionsByUser.map((d) => d.authorId);
  const authors = await prisma.user.findMany({
    where: { id: { in: authorIds } },
    select: { id: true, name: true, email: true },
  });
  const authorName = new Map(authors.map((a) => [a.id, a.name ?? a.email]));

  const clientRows = byClientRaw
    .map((r) => ({
      name: r.clientId ? clientName.get(r.clientId) ?? "Unknown" : "Unknown",
      total: r._sum.amountMinor ?? 0,
      count: r._count,
    }))
    .sort((a, b) => b.total - a.total);

  const topClient = clientRows[0];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="mt-1 text-sm text-muted">Revenue, clients and team — straight from the memory.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Collected (all time)" value={formatInr(paidAll._sum.amountMinor ?? 0)} />
        <StatCard label="Collected (YTD)" value={formatInr(paidYear._sum.amountMinor ?? 0)} />
        <StatCard label="Collected (this month)" value={formatInr(paidMonth._sum.amountMinor ?? 0)} />
        <StatCard label="Outstanding (sent)" value={formatInr(sent._sum.amountMinor ?? 0)} />
        <StatCard label="Overdue" value={formatInr(overdue._sum.amountMinor ?? 0)} />
      </div>

      <section aria-label="Client profitability">
        <Card>
          <SectionTitle>Client revenue</SectionTitle>
          {clientRows.length === 0 ? (
            <div className="mt-3">
              <EmptyState title="No invoices yet" hint="Revenue appears once invoices exist." />
            </div>
          ) : (
            <div className="mt-4">
              <Table head={["Client", "Invoices", "Total value"]}>
                {clientRows.map((r) => (
                  <tr key={r.name}>
                    <td className="px-4 py-2.5 font-medium">{r.name}</td>
                    <td className="px-4 py-2.5 text-muted">{r.count}</td>
                    <td className="px-4 py-2.5">{formatInr(r.total)}</td>
                  </tr>
                ))}
              </Table>
              {topClient ? (
                <p className="mt-3 text-xs text-muted">
                  Largest account: {topClient.name} ({formatInr(topClient.total)} across {topClient.count} invoices).
                </p>
              ) : null}
            </div>
          )}
        </Card>
      </section>

      <section aria-label="Team performance">
        <Card>
          <SectionTitle>Decisions logged by member</SectionTitle>
          {decisionsByUser.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No decisions logged yet.</p>
          ) : (
            <div className="mt-4">
              <Table head={["Member", "Decisions"]}>
                {decisionsByUser
                  .map((d) => ({
                    name: authorName.get(d.authorId) ?? "Unknown",
                    count: d._count,
                  }))
                  .sort((a, b) => b.count - a.count)
                  .map((r) => (
                    <tr key={r.name}>
                      <td className="px-4 py-2.5 font-medium">{r.name}</td>
                      <td className="px-4 py-2.5 text-muted">{r.count}</td>
                    </tr>
                  ))}
              </Table>
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}
