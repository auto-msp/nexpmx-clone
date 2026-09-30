import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getOrgContext } from "@/lib/tenancy";
import { prisma } from "@/lib/db";
import { planOf } from "@/lib/plans";
import { Card, StatCard, SectionTitle, Badge, EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "Overview", robots: { index: false } };

export default async function DashboardPage() {
  const session = await auth();
  const ctx = await getOrgContext(session!.user!.id);
  const org = await prisma.organization.findUnique({
    where: { id: ctx!.orgId },
    include: { _count: { select: { clients: true, projects: true, invoices: true } } },
  });
  const plan = planOf(org?.plan);

  const recentDecisions = await prisma.decision.findMany({
    where: { orgId: ctx!.orgId },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { author: { select: { name: true } } },
  });

  const overdueInvoices = await prisma.invoice.count({
    where: {
      orgId: ctx!.orgId,
      status: { in: ["SENT", "OVERDUE"] },
      dueAt: { lt: new Date() },
    },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {plan.name} plan overview
        </h1>
        <p className="mt-1 text-sm text-muted">
          AI credits used this cycle: {org?.aiCreditsUsed ?? 0} / {plan.aiCreditsPerMonth}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Clients" value={org?._count.clients ?? 0} hint={`Plan cap: ${plan.maxActiveClients ?? "unlimited"}`} />
        <StatCard label="Projects" value={org?._count.projects ?? 0} />
        <StatCard label="Invoices" value={org?._count.invoices ?? 0} />
        <StatCard
          label="Overdue invoices"
          value={overdueInvoices}
          hint={overdueInvoices > 0 ? "Action needed" : "All clear"}
        />
      </div>

      <section aria-labelledby="recent-decisions">
        <SectionTitle>Recent decisions</SectionTitle>
        <div className="mt-4 grid gap-4">
          {recentDecisions.length === 0 ? (
            <EmptyState
              title="No decisions recorded yet"
              hint="Decisions keep the 'why' behind your work — log your first one."
            />
          ) : (
            recentDecisions.map((d) => (
              <Card key={d.id}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-medium">{d.title}</h3>
                    <p className="mt-1 line-clamp-2 text-sm text-muted">{d.body}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted">
                    {d.createdAt.toISOString().slice(0, 10)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted">— {d.author.name ?? "Unknown"}</p>
              </Card>
            ))
          )}
        </div>
      </section>

      <section aria-labelledby="quick-links">
        <SectionTitle>Quick links</SectionTitle>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link href="/clients" className="rounded-card border border-border px-4 py-2 hover:border-brand">Clients →</Link>
          <Link href="/projects" className="rounded-card border border-border px-4 py-2 hover:border-brand">Projects →</Link>
          <Link href="/invoices" className="rounded-card border border-border px-4 py-2 hover:border-brand">Invoices →</Link>
          <Link href="/assistant" className="rounded-card border border-border px-4 py-2 hover:border-brand">Ask AI →</Link>
        </div>
      </section>
    </div>
  );
}
