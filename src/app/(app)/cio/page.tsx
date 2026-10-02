import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { pageContext } from "@/lib/page";
import { daysFromNow, fmtDate, inr, relTime } from "@/lib/format";
import { PageHeader, KpiGrid, KpiTile, Panel, EmptyPanel } from "@/components/kit";
import { Icon } from "@/components/kit-icons";
import { Badge, Button } from "@/components/ui";

export const metadata: Metadata = { title: "Morning briefing", robots: { index: false } };

const gross = (i: { amountMinor: number; gstRateBps: number }) => i.amountMinor + Math.round((i.amountMinor * i.gstRateBps) / 10_000);
const DAY = 86_400_000;

const SUGGESTIONS = [
  "Which invoices are overdue and how much?",
  "What projects are at risk?",
  "What is due this week?",
];

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export default async function CioPage() {
  const { orgId, userName } = await pageContext();
  const now = new Date();
  const monthAgo = new Date(now.getTime() - 30 * DAY);
  const weekOut = new Date(now.getTime() + 7 * DAY);

  const [paid, open, atRiskProjects, watchClients, proposals, openQuestions, decisionsThisMonth, recentDecisions, overdueTaskCount, tasksSoon, milestonesSoon, activeProjects, memberCount, doneProjects] =
    await Promise.all([
      prisma.invoice.findMany({ where: { orgId, status: "PAID", updatedAt: { gte: monthAgo } }, select: { amountMinor: true, gstRateBps: true } }),
      prisma.invoice.findMany({
        where: { orgId, status: { in: ["SENT", "OVERDUE"] } },
        include: { client: { select: { name: true } } },
        orderBy: { dueAt: "asc" },
        take: 100,
      }),
      prisma.project.findMany({
        where: {
          orgId,
          status: { not: "COMPLETED" },
          OR: [{ health: { in: ["AT_RISK", "OFF_TRACK"] } }, { deadline: { lt: now } }],
        },
        include: { client: { select: { name: true } } },
        orderBy: { deadline: "asc" },
        take: 8,
      }),
      prisma.client.findMany({
        where: { orgId, status: "ACTIVE", OR: [{ health: { in: ["WATCH", "AT_RISK"] } }, { nextFollowUpAt: { lt: now } }] },
        orderBy: { updatedAt: "desc" },
        take: 6,
        select: { id: true, name: true, health: true, nextFollowUpAt: true },
      }),
      prisma.proposal.findMany({ where: { orgId, status: { in: ["SENT", "VIEWED"] } }, select: { amountMinor: true } }),
      prisma.memoryQuestion.count({ where: { orgId, state: "OPEN" } }),
      prisma.decision.count({ where: { orgId, createdAt: { gte: monthAgo } } }),
      prisma.decision.findMany({ where: { orgId }, orderBy: { createdAt: "desc" }, take: 3, select: { id: true, title: true, createdAt: true } }),
      prisma.task.count({ where: { orgId, status: { not: "DONE" }, dueDate: { lt: now } } }),
      prisma.task.findMany({
        where: { orgId, status: { not: "DONE" }, dueDate: { gte: now, lte: weekOut } },
        orderBy: { dueDate: "asc" },
        take: 6,
        include: { project: { select: { id: true, name: true } } },
      }),
      prisma.milestone.findMany({
        where: { orgId, completedAt: null, dueDate: { gte: now, lte: weekOut } },
        orderBy: { dueDate: "asc" },
        take: 5,
        include: { project: { select: { id: true, name: true } } },
      }),
      prisma.project.count({ where: { orgId, status: "ACTIVE" } }),
      prisma.membership.count({ where: { orgId } }),
      prisma.project.findMany({
        where: { orgId, status: { in: ["ACTIVE", "COMPLETED"] }, tasks: { some: { status: "DONE" } } },
        select: { id: true, name: true, client: { select: { name: true } } },
        take: 50,
      }),
    ]);

  const billed = doneProjects.length
    ? await prisma.invoice.findMany({ where: { orgId, projectId: { in: doneProjects.map((p) => p.id) } }, select: { projectId: true } })
    : [];
  const billedIds = new Set(billed.map((b) => b.projectId));
  const unbilled = doneProjects.filter((p) => !billedIds.has(p.id));

  const cash = paid.reduce((n, i) => n + gross(i), 0);
  const outstanding = open.reduce((n, i) => n + gross(i), 0);
  const overdue = open.filter((i) => i.status === "OVERDUE" || (i.dueAt && i.dueAt < now));
  const overdueTotal = overdue.reduce((n, i) => n + gross(i), 0);
  const proposalValue = proposals.reduce((n, p) => n + p.amountMinor, 0);
  const dueInvoices = open.filter((i) => i.dueAt && i.dueAt >= now && i.dueAt <= weekOut);

  const firstName = userName.split(/[\s@]/)[0] || "there";
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(now)) % 24;
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const readAt = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).format(now);

  const briefing: string[] = [];
  briefing.push(
    overdue.length
      ? `${inr(overdueTotal)} is overdue across ${plural(overdue.length, "invoice")}, starting with ${overdue[0].client.name}. Chasing it first is the quickest way to improve cash.`
      : open.length
        ? `Nothing is overdue. ${inr(outstanding)} is still outstanding across ${plural(open.length, "invoice")}.`
        : "Nothing is owed to you right now.",
  );
  if (cash > 0) briefing.push(`${inr(cash)} came in over the last 30 days.`);
  briefing.push(
    atRiskProjects.length
      ? `${plural(atRiskProjects.length, "project")} ${atRiskProjects.length === 1 ? "needs" : "need"} attention, led by ${atRiskProjects[0].name}.`
      : activeProjects
        ? `All ${plural(activeProjects, "active project")} look on track.`
        : "There are no active projects yet.",
  );
  if (proposals.length) briefing.push(`${plural(proposals.length, "proposal")} worth ${inr(proposalValue)} ${proposals.length === 1 ? "is" : "are"} waiting for a client decision.`);
  if (overdueTaskCount || tasksSoon.length) {
    briefing.push(
      `${plural(overdueTaskCount, "task")} ${overdueTaskCount === 1 ? "is" : "are"} past due and ${plural(tasksSoon.length, "more")} ${tasksSoon.length === 1 ? "falls" : "fall"} due in the next seven days.`,
    );
  }
  if (unbilled.length) briefing.push(`${plural(unbilled.length, "project")} ${unbilled.length === 1 ? "has" : "have"} finished work but no invoice yet.`);
  if (openQuestions) briefing.push(`${plural(openQuestions, "question")} in your business memory ${openQuestions === 1 ? "is" : "are"} still unanswered.`);

  const attention: Array<{ key: string; href: string; title: string; meta: string; tone: "danger" | "warn" }> = [
    ...overdue.slice(0, 4).map((i) => ({
      key: `inv-${i.id}`,
      href: `/invoices/${i.id}`,
      title: `${i.number} · ${i.client.name}`,
      meta: `${inr(gross(i))} overdue`,
      tone: "danger" as const,
    })),
    ...atRiskProjects.slice(0, 4).map((p) => ({
      key: `prj-${p.id}`,
      href: `/projects/${p.id}`,
      title: p.name,
      meta: p.deadline && p.deadline < now ? "Past its deadline" : p.health.replace(/_/g, " ").toLowerCase(),
      tone: "danger" as const,
    })),
    ...watchClients.slice(0, 4).map((c) => ({
      key: `cl-${c.id}`,
      href: `/clients/${c.id}`,
      title: c.name,
      meta: c.nextFollowUpAt && c.nextFollowUpAt < now ? "Follow-up overdue" : c.health.replace(/_/g, " ").toLowerCase(),
      tone: "warn" as const,
    })),
  ];

  const dueSoon: Array<{ key: string; href: string; title: string; meta: string; date: Date }> = [
    ...tasksSoon.map((t) => ({
      key: `t-${t.id}`,
      href: t.project ? `/projects/${t.project.id}` : "/tasks",
      title: t.title,
      meta: `Task${t.project ? ` · ${t.project.name}` : ""}`,
      date: t.dueDate as Date,
    })),
    ...milestonesSoon.map((m) => ({
      key: `m-${m.id}`,
      href: `/projects/${m.project.id}`,
      title: m.name,
      meta: `Milestone · ${m.project.name}`,
      date: m.dueDate as Date,
    })),
    ...dueInvoices.map((i) => ({
      key: `i-${i.id}`,
      href: `/invoices/${i.id}`,
      title: `${i.number} · ${i.client.name}`,
      meta: `Payment due · ${inr(gross(i))}`,
      date: i.dueAt as Date,
    })),
  ]
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 8);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        eyebrow="Chief intelligence officer"
        title="Morning briefing"
        subtitle="What changed, what needs you and where the money stands, built live from your workspace."
      />

      <KpiGrid cols={3}>
        <KpiTile label="Cash collected · 30 days" value={inr(cash)} icon="rupee" tone="success" href="/finance" hint={`${plural(paid.length, "paid invoice")}`} />
        <KpiTile label="Outstanding" value={inr(outstanding)} icon="wallet" href="/invoices" hint={`${plural(open.length, "unpaid invoice")}`} />
        <KpiTile label="Overdue" value={inr(overdueTotal)} icon="alert" tone={overdue.length ? "danger" : "neutral"} href="/invoices" hint={`${plural(overdue.length, "invoice")} past due`} />
        <KpiTile label="Projects at risk" value={atRiskProjects.length} icon="flag" tone={atRiskProjects.length ? "warn" : "neutral"} href="/projects" hint={`${activeProjects} active in total`} />
        <KpiTile label="Proposals awaiting" value={proposals.length} icon="send" href="/proposals" hint={proposals.length ? `${inr(proposalValue)} out for decision` : "None out for decision"} />
        <KpiTile label="Open questions" value={openQuestions} icon="help" href="/memory/questions" hint={`${plural(decisionsThisMonth, "decision")} logged in 30 days`} />
      </KpiGrid>

      <Panel
        title={
          <span className="inline-flex items-center gap-2">
            <Icon name="sparkle" className="h-4 w-4 text-brand" /> Morning briefing
          </span>
        }
        className="mb-6"
      >
        <p className="text-sm font-medium">{greeting}, {firstName}.</p>
        <p className="mt-2 text-sm leading-relaxed text-muted">{briefing.join(" ")}</p>
        <details className="mt-4 border-t border-border pt-3 text-xs text-muted">
          <summary className="cursor-pointer">
            Based on {plural(activeProjects, "active project")} and {plural(memberCount, "person", "people")} on the team · read at {readAt}
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>{plural(open.length, "unpaid invoice")}, {plural(paid.length, "payment")} received in the last 30 days</li>
            <li>{plural(atRiskProjects.length, "flagged project")}, {plural(watchClients.length, "client")} to watch</li>
            <li>{plural(overdueTaskCount, "overdue task")}, {plural(tasksSoon.length, "task")} due this week</li>
          </ul>
        </details>
      </Panel>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/15 text-brand"><Icon name="chart" /></span>
          <div>
            <p className="text-xs text-muted">Active projects</p>
            <p className="text-lg font-semibold">{activeProjects}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/15 text-brand"><Icon name="wallet" /></span>
          <div>
            <p className="text-xs text-muted">Total receivables</p>
            <p className="text-lg font-semibold">{inr(outstanding)}</p>
          </div>
        </div>
      </div>

      <Panel
        title={
          <span className="inline-flex items-center gap-2">
            <Icon name="sparkle" className="h-4 w-4 text-brand" /> Ask anything about your business
          </span>
        }
        className="mb-6"
      >
        <form action="/assistant" method="get" className="flex flex-col gap-2 sm:flex-row">
          <label className="flex-1">
            <span className="sr-only">Your question</span>
            <input
              name="q"
              required
              minLength={3}
              maxLength={300}
              placeholder="e.g. Who owes us money and how much?"
              className="w-full rounded-[var(--radius-control)] border border-border bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-muted/60 focus:border-brand focus:outline-none"
            />
          </label>
          <Button type="submit">
            <Icon name="send" /> Ask
          </Button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <Link key={s} href={`/assistant?q=${encodeURIComponent(s)}`} className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs text-muted hover:border-brand hover:text-text">
              {s}
            </Link>
          ))}
        </div>
      </Panel>

      <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <section id="needs-attention" aria-label="Needs attention">
          <Panel title="Needs attention" action={attention.length ? <Badge tone="danger">{attention.length}</Badge> : undefined} className="h-full">
            {attention.length === 0 ? (
              <p className="text-sm text-muted">Every account looks healthy.</p>
            ) : (
              <ul className="space-y-3">
                {attention.map((a) => (
                  <li key={a.key}>
                    <Link href={a.href} className="flex items-start justify-between gap-3 rounded-[var(--radius-control)] p-1 hover:bg-surface-2">
                      <span className="min-w-0 text-sm font-medium">{a.title}</span>
                      <Badge tone={a.tone}>{a.meta}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {overdueTaskCount ? (
              <p className="mt-3 border-t border-border pt-3 text-xs text-muted">
                <Link href="/tasks" className="text-brand hover:underline">{plural(overdueTaskCount, "task")} past due</Link>
              </p>
            ) : null}
          </Panel>
        </section>

        <section id="due-soon" aria-label="Due soon">
          <Panel title="Due soon" className="h-full">
            {dueSoon.length === 0 ? (
              <p className="text-sm text-muted">Nothing due in the next seven days.</p>
            ) : (
              <ul className="space-y-3">
                {dueSoon.map((d) => {
                  const days = daysFromNow(d.date);
                  return (
                    <li key={d.key}>
                      <Link href={d.href} className="flex items-start justify-between gap-3 rounded-[var(--radius-control)] p-1 hover:bg-surface-2">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{d.title}</span>
                          <span className="block truncate text-xs text-muted">{d.meta}</span>
                        </span>
                        <span className="shrink-0 text-xs text-muted">{days === 0 ? "Today" : days === 1 ? "Tomorrow" : fmtDate(d.date)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </section>

        <section id="money-owed" aria-label="Money owed">
          <Panel title="Money owed" action={open.length ? <span className="text-sm font-semibold">{inr(outstanding)}</span> : undefined} className="h-full">
            {open.length === 0 ? (
              <p className="text-sm text-muted">Nothing outstanding.</p>
            ) : (
              <ul className="space-y-3">
                {open.slice(0, 8).map((i) => {
                  const late = i.status === "OVERDUE" || (i.dueAt && i.dueAt < now);
                  return (
                    <li key={i.id}>
                      <Link href={`/invoices/${i.id}`} className="flex items-start justify-between gap-3 rounded-[var(--radius-control)] p-1 hover:bg-surface-2">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{i.client.name}</span>
                          <span className="block truncate text-xs text-muted">{i.number}{i.dueAt ? ` · due ${fmtDate(i.dueAt)}` : ""}</span>
                        </span>
                        <span className={late ? "shrink-0 text-sm font-medium text-danger" : "shrink-0 text-sm font-medium"}>{inr(gross(i))}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel
          title={
            <span className="inline-flex items-center gap-2">
              <Icon name="wallet" className="h-4 w-4 text-success" /> Unbilled work
            </span>
          }
        >
          {unbilled.length === 0 ? (
            <p className="text-sm text-muted">Nothing unbilled. Every project with finished work has an invoice.</p>
          ) : (
            <ul className="space-y-2">
              {unbilled.slice(0, 6).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                  <Link href={`/projects/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
                  <span className="text-xs text-muted">{p.client?.name ?? "No client"}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Recent decisions" action={<Link href="/decisions" className="text-xs text-brand hover:underline">Open log</Link>}>
          {recentDecisions.length === 0 ? (
            <EmptyPanel icon="file" title="No decisions logged yet" hint="Write down what was decided and why, so it is easy to find later." action={<Link href="/decisions" className="text-sm text-brand hover:underline">Log a decision</Link>} />
          ) : (
            <ul className="space-y-2">
              {recentDecisions.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 text-sm">
                  <Link href="/decisions" className="truncate font-medium hover:underline">{d.title}</Link>
                  <span className="shrink-0 text-xs text-muted">{relTime(d.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
