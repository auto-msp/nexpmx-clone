import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { getOrgContext } from "@/lib/tenancy";
import { prisma } from "@/lib/db";
import { canRead } from "@/lib/rbac";
import { Badge, Card, EmptyState, SectionTitle, StatCard } from "@/components/ui";
import { rollupWhatWeKnow } from "@/lib/memory";
import { formatInr } from "@/lib/plans";

export const metadata: Metadata = { title: "CIO", robots: { index: false } };

/**
 * CIO — the executive brief. Screenshot evidence: a one-page "what needs
 * attention" digest: revenue at risk (overdue), stalled projects, unassigned
 * tasks, open memory questions, plus a generated brief grounded in the
 * business memory. Copy is our own.
 */

export default async function CioPage() {
  const session = await auth();
  const ctx = await getOrgContext(session!.user!.id);
  if (!canRead(ctx!.role)) throw new Error("Forbidden");
  const orgId = ctx!.orgId;

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);

  const [overdueInvoices, projects, unassignedTasks, openQuestions, staleDecisions, facts, awaitingDecision] =
    await Promise.all([
      prisma.invoice.findMany({
        where: { orgId, status: { in: ["SENT", "OVERDUE"] }, dueAt: { lt: now } },
        include: { client: { select: { name: true } } },
        orderBy: { dueAt: "asc" },
        take: 10,
      }),
      prisma.project.findMany({
        where: { orgId, status: "ACTIVE" },
        include: { tasks: true, client: { select: { name: true } } },
      }),
      prisma.task.count({ where: { orgId, assigneeId: null, status: { not: "DONE" } } }),
      prisma.memoryQuestion.count({ where: { orgId, state: "OPEN" } }),
      prisma.decision.count({ where: { orgId, createdAt: { lt: weekAgo } } }),
      prisma.memoryFact.findMany({ where: { orgId, status: "ACTIVE" }, orderBy: { updatedAt: "desc" }, take: 50 }),
      prisma.proposal.findMany({
        where: { orgId, status: { in: ["SENT", "VIEWED"] } },
        include: { client: { select: { name: true } } },
        orderBy: { sentAt: "asc" },
        take: 5,
      }),
    ]);

  const stalledProjects = projects.filter(
    (p) => p.tasks.length > 0 && p.tasks.every((t) => t.status === "DONE"),
  );
  const emptyProjects = projects.filter((p) => p.tasks.length === 0);
  const overdueTotal = overdueInvoices.reduce((s, i) => s + i.amountMinor, 0);
  const pipelineValue = awaitingDecision.reduce((s, p) => s + p.amountMinor, 0);

  const brief = [
    overdueInvoices.length
      ? `${overdueInvoices.length} invoice${overdueInvoices.length === 1 ? " is" : "s are"} overdue (${formatInr(overdueTotal)}) — the escalation ladder should already be running.`
      : "Nothing overdue — receivables are clean.",
    awaitingDecision.length
      ? `${awaitingDecision.length} proposal${awaitingDecision.length === 1 ? "" : "s"} awaiting client decision (${formatInr(pipelineValue)}); the oldest has been out since ${awaitingDecision[0].sentAt?.toISOString().slice(0, 10) ?? "n/a"}.`
      : "No proposals waiting on clients.",
    stalledProjects.length
      ? `${stalledProjects.length} active project${stalledProjects.length === 1 ? " has all tasks done but" : "s have all tasks done but"} is still open — close or plan the next phase.`
      : null,
    emptyProjects.length
      ? `${emptyProjects.length} project${emptyProjects.length === 1 ? " has" : "s have"} no tasks yet — break the scope before work starts.`
      : null,
    unassignedTasks
      ? `${unassignedTasks} task${unassignedTasks === 1 ? "" : "s"} without an owner.`
      : null,
    openQuestions
      ? `${openQuestions} open memory question${openQuestions === 1 ? "" : "s"} — answer them once and they stop being questions.`
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  const memorySummary = rollupWhatWeKnow(facts);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">CIO</h1>
        <p className="mt-1 text-sm text-muted">
          The executive brief: what needs attention across the whole business, updated live.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Overdue"
          value={formatInr(overdueTotal)}
          hint={`${overdueInvoices.length} invoice${overdueInvoices.length === 1 ? "" : "s"}`}
        />
        <StatCard label="Awaiting decision" value={formatInr(pipelineValue)} hint={`${awaitingDecision.length} proposals`} />
        <StatCard label="Unassigned tasks" value={unassignedTasks} />
        <StatCard label="Open questions" value={openQuestions} />
      </div>

      <Card>
        <SectionTitle>Today's brief</SectionTitle>
        <p className="mt-2 text-sm leading-relaxed">
          {brief || "All clear — nothing needs attention today."}
        </p>
        <p className="mt-3 text-xs text-muted">
          Grounded in {facts.length} memory facts. {memorySummary ? `Memory: ${memorySummary}` : "Memory is empty — import facts to sharpen this brief."}
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle>Receivables watchlist</SectionTitle>
          {overdueInvoices.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Nothing overdue.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {overdueInvoices.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2">
                  <span>
                    <span className="font-medium">{i.client.name}</span>{" "}
                    <span className="text-muted">{i.number}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span>{formatInr(i.amountMinor)}</span>
                    <Badge tone="danger">
                      due {i.dueAt?.toISOString().slice(0, 10) ?? "—"}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <SectionTitle>Pipeline watchlist</SectionTitle>
          {awaitingDecision.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No proposals waiting.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {awaitingDecision.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2">
                  <span>
                    <span className="font-medium">{p.client?.name ?? "No client"}</span>{" "}
                    <span className="text-muted">{p.title}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span>{formatInr(p.amountMinor)}</span>
                    <Badge tone="warn">{p.status.toLowerCase()}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <SectionTitle>Delivery risks</SectionTitle>
          {stalledProjects.length === 0 && emptyProjects.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No stalled or empty projects.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {stalledProjects.map((p) => (
                <li key={p.id}>
                  <span className="font-medium">{p.name}</span> — all {p.tasks.length} tasks done,
                  project still active.
                </li>
              ))}
              {emptyProjects.map((p) => (
                <li key={p.id}>
                  <span className="font-medium">{p.name}</span> — no tasks yet.
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <SectionTitle>Decisions still missing</SectionTitle>
          {staleDecisions === 0 ? (
            <p className="mt-2 text-sm text-muted">Recent decisions logged — good hygiene.</p>
          ) : (
            <p className="mt-2 text-sm text-muted">
              {staleDecisions} decision{staleDecisions === 1 ? "" : "s"} logged so far, none in the
              last 7 days. If something was decided this week, log it while it's fresh.
            </p>
          )}
        </Card>
      </div>

      {overdueInvoices.length === 0 &&
      awaitingDecision.length === 0 &&
      stalledProjects.length === 0 &&
      emptyProjects.length === 0 &&
      unassignedTasks === 0 ? (
        <EmptyState title="Nothing needs attention" hint="The brief will speak up when it does." />
      ) : null}
    </div>
  );
}
