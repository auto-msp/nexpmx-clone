import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getOrgContext } from "@/lib/tenancy";
import { prisma } from "@/lib/db";
import { planOf, formatInr } from "@/lib/plans";
import { Card, StatCard, SectionTitle, Badge, EmptyState, ButtonLink } from "@/components/ui";
import { subscriptionView } from "@/lib/subscription";
import { getOrCreateSubscription } from "@/lib/subscription";
import { AI_EMPLOYEES } from "@/lib/ai-team";

export const metadata: Metadata = { title: "Home", robots: { index: false } };

/**
 * Home / Command center (screenshot evidence): greeting, an attention queue
 * of things needing action (overdue invoices, unsigned proposals, unassigned
 * tasks, open questions), revenue snapshot, AI team status and quick links.
 */

export default async function DashboardPage() {
  const session = await auth();
  const ctx = await getOrgContext(session!.user!.id);
  const orgId = ctx!.orgId;

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = (session!.user!.name ?? "there").split(" ")[0];

  const [org, sub, overdueInvoices, pendingProposals, unassigned, openQuestions, recentDecisions, enabledEmployees, paidAgg] =
    await Promise.all([
      prisma.organization.findUnique({
        where: { id: orgId },
        include: { _count: { select: { clients: true, projects: true, invoices: true } } },
      }),
      getOrCreateSubscription(orgId),
      prisma.invoice.findMany({
        where: { orgId, status: { in: ["SENT", "OVERDUE"] }, dueAt: { lt: now } },
        include: { client: { select: { name: true } } },
        orderBy: { dueAt: "asc" },
        take: 5,
      }),
      prisma.proposal.findMany({
        where: { orgId, status: { in: ["SENT", "VIEWED"] } },
        orderBy: { sentAt: "asc" },
        take: 5,
        include: { client: { select: { name: true } } },
      }),
      prisma.task.count({ where: { orgId, assigneeId: null, status: { not: "DONE" } } }),
      prisma.memoryQuestion.count({ where: { orgId, state: "OPEN" } }),
      prisma.decision.findMany({
        where: { orgId },
        orderBy: { createdAt: "desc" },
        take: 4,
        include: { author: { select: { name: true } } },
      }),
      prisma.aiEmployee.findMany({ where: { orgId, enabled: true } }),
      prisma.invoice.aggregate({ where: { orgId, status: "PAID" }, _sum: { amountMinor: true } }),
    ]);

  const plan = planOf(org?.plan);
  const view = subscriptionView(sub);
  const overdueTotal = overdueInvoices.reduce((s, i) => s + i.amountMinor, 0);
  const pipeline = pendingProposals.reduce((s, p) => s + p.amountMinor, 0);

  const attention: string[] = [];
  if (overdueInvoices.length > 0)
    attention.push(`${overdueInvoices.length} overdue invoice${overdueInvoices.length === 1 ? "" : "s"} (${formatInr(overdueTotal)})`);
  if (pendingProposals.length > 0)
    attention.push(`${pendingProposals.length} proposal${pendingProposals.length === 1 ? "" : "s"} awaiting decision (${formatInr(pipeline)})`);
  if (unassigned > 0) attention.push(`${unassigned} task${unassigned === 1 ? "" : "s"} without an owner`);
  if (openQuestions > 0) attention.push(`${openQuestions} open memory question${openQuestions === 1 ? "" : "s"}`);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {greeting}, {firstName}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {attention.length > 0
            ? `${attention.length} thing${attention.length === 1 ? "" : "s"} need your attention today.`
            : "Everything is calm — nothing needs your attention."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Clients" value={org?._count.clients ?? 0} hint={`Plan cap: ${plan.maxActiveClients ?? "unlimited"}`} />
        <StatCard label="Collected" value={formatInr(paidAgg._sum.amountMinor ?? 0)} hint="all time" />
        <StatCard label="Overdue" value={formatInr(overdueTotal)} hint={`${overdueInvoices.length} invoice${overdueInvoices.length === 1 ? "" : "s"}`} />
        <StatCard
          label="AI credits"
          value={`${org?.aiCreditsUsed ?? 0}/${plan.aiCreditsPerMonth}`}
          hint={view.state === "TRIALING" ? "trial" : view.state.toLowerCase()}
        />
      </div>

      {attention.length > 0 ? (
        <Card className="border-warn/40">
          <SectionTitle>Needs attention</SectionTitle>
          <ul className="mt-3 space-y-1.5 text-sm">
            {attention.map((a) => (
              <li key={a} className="flex items-center gap-2">
                <span aria-hidden className="text-warn">▲</span>
                {a}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-3">
            {overdueInvoices.length > 0 ? (
              <ButtonLink href="/invoices" variant="secondary" className="px-3 py-1.5 text-xs">
                Review invoices
              </ButtonLink>
            ) : null}
            {pendingProposals.length > 0 ? (
              <ButtonLink href="/proposals" variant="secondary" className="px-3 py-1.5 text-xs">
                Review proposals
              </ButtonLink>
            ) : null}
            {openQuestions > 0 ? (
              <ButtonLink href="/memory/questions" variant="secondary" className="px-3 py-1.5 text-xs">
                Answer questions
              </ButtonLink>
            ) : null}
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="ai-team-status">
          <Card>
            <SectionTitle>AI team</SectionTitle>
            <ul className="mt-3 space-y-2 text-sm">
              {AI_EMPLOYEES.map((e) => {
                const on = enabledEmployees.some((row) => row.key === e.key);
                return (
                  <li key={e.key} className="flex items-center justify-between gap-2">
                    <span>
                      <span aria-hidden className={`mr-2 inline-block h-2 w-2 rounded-full align-middle ${e.avatarHue}`} />
                      {e.name} <span className="text-muted">· {e.role}</span>
                    </span>
                    <Badge tone={on ? "success" : "neutral"}>{on ? "on duty" : "off"}</Badge>
                  </li>
                );
              })}
            </ul>
            <Link href="/ai/team" className="mt-3 inline-block text-xs text-brand hover:underline">
              Manage the team →
            </Link>
          </Card>
        </section>

        <section aria-labelledby="recent-decisions">
          <Card>
            <SectionTitle>Recent decisions</SectionTitle>
            {recentDecisions.length === 0 ? (
              <div className="mt-3">
                <EmptyState title="No decisions recorded yet" hint="Log the 'why' behind your work." />
              </div>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {recentDecisions.map((d) => (
                  <li key={d.id} className="truncate">
                    <span className="text-xs text-muted">{d.createdAt.toISOString().slice(0, 10)}</span>{" "}
                    <span className="font-medium">{d.title}</span>{" "}
                    <span className="text-muted">— {d.author.name ?? "Unknown"}</span>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/decisions" className="mt-3 inline-block text-xs text-brand hover:underline">
              All decisions →
            </Link>
          </Card>
        </section>
      </div>

      <section aria-labelledby="quick-links">
        <SectionTitle>Quick links</SectionTitle>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link href="/clients" className="rounded-card border border-border px-4 py-2 hover:border-brand">Clients →</Link>
          <Link href="/projects" className="rounded-card border border-border px-4 py-2 hover:border-brand">Projects →</Link>
          <Link href="/proposals" className="rounded-card border border-border px-4 py-2 hover:border-brand">Proposals →</Link>
          <Link href="/comms" className="rounded-card border border-border px-4 py-2 hover:border-brand">Comms →</Link>
          <Link href="/memory" className="rounded-card border border-border px-4 py-2 hover:border-brand">Memory →</Link>
          <Link href="/cio" className="rounded-card border border-border px-4 py-2 hover:border-brand">CIO brief →</Link>
          <Link href="/assistant" className="rounded-card border border-border px-4 py-2 hover:border-brand">Ask AI →</Link>
        </div>
      </section>
    </div>
  );
}
