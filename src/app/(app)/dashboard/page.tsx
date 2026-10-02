import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { orgMembers, pageContext } from "@/lib/page";
import { inr, relTime } from "@/lib/format";
import { planOf } from "@/lib/plans";
import { AI_EMPLOYEES } from "@/lib/ai-team";
import { Badge, ButtonLink, Input, cx } from "@/components/ui";
import { Avatar, EmptyPanel, HealthBadge, KpiGrid, KpiTile, Panel, ProgressBar } from "@/components/kit";
import { ActionForm } from "@/components/kit-client";
import { Icon } from "@/components/kit-icons";
import { GroupedBars } from "@/components/home/charts";
import { createTask } from "@/app/actions/tasks";
import {
  MONTH_NAMES,
  addDaysKey,
  addMonthsKey,
  dayKey,
  diffDays,
  fmtKey,
  invoiceGross,
  istDateTime,
  istKey,
  monthStartKey,
  todayKey,
} from "@/components/home/dates";

export const metadata: Metadata = { title: "Home", robots: { index: false } };

/**
 * Command center: greeting, KPI tiles, an attention queue (overdue invoices,
 * proposals awaiting signature, unowned / overdue tasks, open memory
 * questions), collection chart, project health, team workload, recent
 * decisions, AI team status and quick actions. All figures are computed from
 * the signed-in organisation's data.
 */

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export default async function DashboardPage() {
  const { orgId, userId, userName, canWrite } = await pageContext("task:write");

  const today = todayKey();
  const todayStart = istDateTime(today, "00:00");
  const weekEnd = istDateTime(addDaysKey(today, 8), "00:00");
  const hour = new Date(Date.now() + 330 * 60_000).getUTCHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = userName.split(/[\s@]/)[0] || "there";

  const firstMonth = addMonthsKey(monthStartKey(today), -5);
  const monthKeys = Array.from({ length: 6 }, (_, i) => addMonthsKey(firstMonth, i));
  const chartStart = istDateTime(firstMonth, "00:00");

  const visible = { OR: [{ projectId: { not: null } }, { createdById: userId }, { assigneeId: userId }] };

  const [
    org,
    activeClients,
    activeProjects,
    outstanding,
    proposals,
    unassigned,
    overdueTasks,
    overdueTaskCount,
    myDueCount,
    myOverdueCount,
    openQuestions,
    paidRecent,
    issuedRecent,
    projects,
    members,
    openBy,
    overdueBy,
    decisions,
    aiOn,
  ] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId }, select: { plan: true, aiCreditsUsed: true } }),
    prisma.client.count({ where: { orgId, status: "ACTIVE" } }),
    prisma.project.count({ where: { orgId, status: { in: ["ACTIVE", "PLANNING"] } } }),
    prisma.invoice.findMany({
      where: { orgId, status: { in: ["SENT", "OVERDUE"] } },
      select: { id: true, number: true, amountMinor: true, gstRateBps: true, dueAt: true, client: { select: { name: true } } },
      orderBy: { dueAt: { sort: "asc", nulls: "last" } },
      take: 500,
    }),
    prisma.proposal.findMany({
      where: { orgId, status: { in: ["SENT", "VIEWED"] } },
      select: { id: true, title: true, status: true, sentAt: true, amountMinor: true, client: { select: { name: true } } },
      orderBy: { sentAt: "asc" },
      take: 20,
    }),
    prisma.task.count({ where: { orgId, assigneeId: null, projectId: { not: null }, status: { not: "DONE" } } }),
    prisma.task.findMany({
      where: { orgId, status: { not: "DONE" }, dueDate: { lt: todayStart }, ...visible },
      select: { id: true, title: true, dueDate: true, projectId: true },
      orderBy: { dueDate: "asc" },
      take: 3,
    }),
    prisma.task.count({ where: { orgId, status: { not: "DONE" }, dueDate: { lt: todayStart }, ...visible } }),
    prisma.task.count({ where: { orgId, assigneeId: userId, status: { not: "DONE" }, dueDate: { lt: weekEnd } } }),
    prisma.task.count({ where: { orgId, assigneeId: userId, status: { not: "DONE" }, dueDate: { lt: todayStart } } }),
    prisma.memoryQuestion.count({ where: { orgId, state: "OPEN" } }),
    prisma.invoice.findMany({ where: { orgId, status: "PAID", updatedAt: { gte: chartStart } }, select: { amountMinor: true, gstRateBps: true, updatedAt: true } }),
    prisma.invoice.findMany({
      where: { orgId, status: { not: "DRAFT" }, OR: [{ issuedAt: { gte: chartStart } }, { issuedAt: null, createdAt: { gte: chartStart } }] },
      select: { amountMinor: true, gstRateBps: true, issuedAt: true, createdAt: true },
    }),
    prisma.project.findMany({
      where: { orgId, status: { in: ["ACTIVE", "PLANNING", "PAUSED"] } },
      select: { id: true, name: true, health: true, status: true, deadline: true, client: { select: { name: true } } },
      orderBy: [{ deadline: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      take: 6,
    }),
    orgMembers(orgId),
    prisma.task.groupBy({ by: ["assigneeId"], where: { orgId, status: { not: "DONE" }, assigneeId: { not: null } }, _count: { _all: true } }),
    prisma.task.groupBy({ by: ["assigneeId"], where: { orgId, status: { not: "DONE" }, assigneeId: { not: null }, dueDate: { lt: todayStart } }, _count: { _all: true } }),
    prisma.decision.findMany({ where: { orgId }, orderBy: { createdAt: "desc" }, take: 4, include: { author: { select: { name: true } } } }),
    prisma.aiEmployee.findMany({ where: { orgId, enabled: true }, select: { key: true } }),
  ]);

  // ── money ──
  const outstandingTotal = outstanding.reduce((s, i) => s + invoiceGross(i), 0);
  const overdueInvoices = outstanding.filter((i) => i.dueAt && i.dueAt < todayStart);
  const overdueTotal = overdueInvoices.reduce((s, i) => s + invoiceGross(i), 0);

  const monthIndex = new Map(monthKeys.map((k, i) => [k.slice(0, 7), i]));
  const collectedBy = monthKeys.map(() => 0);
  const invoicedBy = monthKeys.map(() => 0);
  for (const p of paidRecent) {
    const i = monthIndex.get(istKey(p.updatedAt).slice(0, 7));
    if (i !== undefined) collectedBy[i] += invoiceGross(p);
  }
  for (const p of issuedRecent) {
    const i = monthIndex.get(istKey(p.issuedAt ?? p.createdAt).slice(0, 7));
    if (i !== undefined) invoicedBy[i] += invoiceGross(p);
  }
  const collectedThisMonth = collectedBy[collectedBy.length - 1];

  // ── project health ──
  const projectIds = projects.map((p) => p.id);
  const taskStats = projectIds.length
    ? await prisma.task.groupBy({ by: ["projectId", "status"], where: { orgId, projectId: { in: projectIds } }, _count: { _all: true } })
    : [];
  const progressOf = (id: string) => {
    let total = 0;
    let done = 0;
    for (const r of taskStats) {
      if (r.projectId !== id) continue;
      total += r._count._all;
      if (r.status === "DONE") done += r._count._all;
    }
    return { total, done };
  };

  // ── team workload ──
  const countFor = (rows: Array<{ assigneeId: string | null; _count: { _all: number } }>, id: string) => rows.find((r) => r.assigneeId === id)?._count._all ?? 0;
  const workload = members
    .map((m) => ({ id: m.id, name: m.name ?? m.email, image: m.image, open: countFor(openBy, m.id), overdue: countFor(overdueBy, m.id) }))
    .sort((a, b) => b.open - a.open);
  const maxOpen = Math.max(1, ...workload.map((w) => w.open));

  // ── attention queue ──
  type Attn = { key: string; tone: "danger" | "warn" | "brand" | "neutral"; tag: string; icon: string; title: string; detail: string; href: string };
  const attention: Attn[] = [];
  for (const i of overdueInvoices.slice(0, 3)) {
    const d = i.dueAt ? diffDays(today, dayKey(i.dueAt)) : 0;
    attention.push({
      key: `inv-${i.id}`,
      tone: "danger",
      tag: "Overdue",
      icon: "receipt",
      title: `Invoice ${i.number} · ${inr(invoiceGross(i))}`,
      detail: `${i.client.name} · ${plural(d, "day")} past due`,
      href: `/invoices/${i.id}`,
    });
  }
  for (const p of proposals.slice(0, 3)) {
    attention.push({
      key: `prop-${p.id}`,
      tone: "warn",
      tag: p.status === "VIEWED" ? "Viewed" : "Awaiting signature",
      icon: "file",
      title: p.title,
      detail: `${p.client?.name ?? "No client"}${p.amountMinor ? ` · ${inr(p.amountMinor)}` : ""}${p.sentAt ? ` · sent ${relTime(p.sentAt)}` : ""}`,
      href: `/proposals/${p.id}`,
    });
  }
  for (const t of overdueTasks) {
    const d = t.dueDate ? diffDays(today, dayKey(t.dueDate)) : 0;
    attention.push({
      key: `task-${t.id}`,
      tone: "danger",
      tag: "Task overdue",
      icon: "tasks",
      title: t.title,
      detail: `${plural(d, "day")} past due`,
      href: t.projectId ? `/projects/${t.projectId}` : "/tasks?tab=personal",
    });
  }
  if (unassigned > 0) {
    attention.push({
      key: "unassigned",
      tone: "brand",
      tag: "No owner",
      icon: "user",
      title: `${plural(unassigned, "project task")} without an assignee`,
      detail: "Give each one an owner so it does not stall",
      href: "/tasks?tab=all",
    });
  }
  if (openQuestions > 0) {
    attention.push({
      key: "memory",
      tone: "neutral",
      tag: "Memory",
      icon: "brain",
      title: `${plural(openQuestions, "open question")} waiting for an answer`,
      detail: "A few minutes of answers makes the AI far more useful",
      href: "/memory/questions",
    });
  }

  const summaryParts: string[] = [];
  if (overdueInvoices.length) summaryParts.push(`${plural(overdueInvoices.length, "overdue invoice")} (${inr(overdueTotal)})`);
  if (proposals.length) summaryParts.push(`${plural(proposals.length, "proposal")} awaiting a decision`);
  if (overdueTaskCount) summaryParts.push(`${plural(overdueTaskCount, "overdue task")}`);
  if (unassigned) summaryParts.push(`${plural(unassigned, "unassigned task")}`);
  if (openQuestions) summaryParts.push(`${plural(openQuestions, "open memory question")}`);

  const plan = planOf(org?.plan);
  const creditsUsed = org?.aiCreditsUsed ?? 0;

  const quick: Array<{ href: string; label: string; icon: string }> = [
    { href: "/clients", label: "Clients", icon: "users" },
    { href: "/projects", label: "Projects", icon: "folder" },
    { href: "/proposals", label: "New proposal", icon: "file" },
    { href: "/invoices/new", label: "New invoice", icon: "receipt" },
    { href: "/expenses", label: "Log expense", icon: "wallet" },
    { href: "/calendar", label: "Calendar", icon: "calendar" },
    { href: "/cio", label: "CIO briefing", icon: "chart" },
    { href: "/assistant", label: "Ask the AI", icon: "sparkle" },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Hero */}
      <section className="rounded-[var(--radius-card)] border border-border bg-surface p-5 sm:p-6">
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">
          {fmtKey(today, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          {greeting}, {firstName}
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          {summaryParts.length
            ? `Needs you today: ${summaryParts.join(", ")}.`
            : "Everything is calm. Nothing is overdue and nothing is waiting on you."}
        </p>
        {canWrite ? (
          <div className="mt-4 max-w-xl">
            <ActionForm action={createTask} submitLabel="Add" pendingLabel="Adding…" className="sm:flex-row sm:items-center" footerClassName="shrink-0" cancelLabel="">
              <Input name="title" required maxLength={200} placeholder="Quick add a to-do for yourself…" aria-label="Quick add a personal task" className="min-w-0 flex-1" />
            </ActionForm>
          </div>
        ) : null}
      </section>

      {/* KPIs */}
      <KpiGrid cols={4}>
        <KpiTile label="Active clients" value={activeClients} hint="Accounts you are serving" icon="users" href="/clients" />
        <KpiTile label="Active projects" value={activeProjects} hint="Planning or in progress" icon="folder" href="/projects" tone="brand" />
        <KpiTile
          label="Outstanding"
          value={inr(outstandingTotal)}
          hint={overdueInvoices.length ? `${inr(overdueTotal)} overdue` : `${plural(outstanding.length, "open invoice")}`}
          icon="rupee"
          href="/invoices"
          tone={overdueInvoices.length ? "warn" : "neutral"}
        />
        <KpiTile
          label="Tasks due"
          value={myDueCount}
          hint={myOverdueCount ? `${myOverdueCount} overdue · assigned to you, next 7 days` : "Assigned to you, next 7 days"}
          icon="tasks"
          href="/tasks"
          tone={myOverdueCount ? "danger" : "neutral"}
        />
      </KpiGrid>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Attention */}
          <Panel title="Needs attention" action={attention.length ? <Badge tone="warn">{attention.length}</Badge> : null} flush>
            {attention.length === 0 ? (
              <div className="p-5">
                <EmptyPanel icon="check" title="All clear" hint="No overdue invoices, stalled proposals or unowned work right now." />
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {attention.map((a) => (
                  <li key={a.key}>
                    <Link href={a.href} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2/50">
                      <span
                        className={cx(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                          a.tone === "danger" ? "bg-danger/15 text-danger" : a.tone === "warn" ? "bg-warn/15 text-warn" : a.tone === "brand" ? "bg-brand/15 text-brand" : "bg-surface-2 text-muted",
                        )}
                      >
                        <Icon name={a.icon} className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{a.title}</span>
                        <span className="block truncate text-xs text-muted">{a.detail}</span>
                      </span>
                      <span className="hidden shrink-0 sm:block">
                        <Badge tone={a.tone}>{a.tag}</Badge>
                      </span>
                      <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-muted" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* Revenue */}
          <Panel
            title="Invoiced vs collected · last 6 months"
            action={
              <Link href="/reports?period=12m" className="text-xs text-brand hover:underline">
                Full report →
              </Link>
            }
          >
            <p className="mb-3 text-xs text-muted">
              Collected this month: <span className="font-medium text-text">{inr(collectedThisMonth)}</span>
            </p>
            <GroupedBars
              labels={monthKeys.map((k) => MONTH_NAMES[Number(k.slice(5, 7)) - 1].slice(0, 3))}
              series={[
                { name: "Invoiced", values: invoicedBy, className: "bg-brand" },
                { name: "Collected", values: collectedBy, className: "bg-success" },
              ]}
              height={150}
              ariaLabel="Invoiced versus collected amounts for the last six months"
            />
          </Panel>

          {/* Project health */}
          <Panel
            title="Project health"
            action={
              <Link href="/projects" className="text-xs text-brand hover:underline">
                All projects →
              </Link>
            }
            flush
          >
            {projects.length === 0 ? (
              <div className="p-5">
                <EmptyPanel icon="folder" title="No active projects" hint="Create a project to track tasks, deadlines and health here." action={<ButtonLink href="/projects">Go to projects</ButtonLink>} />
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {projects.map((p) => {
                  const { total, done } = progressOf(p.id);
                  const left = p.deadline ? diffDays(dayKey(p.deadline), today) : null;
                  return (
                    <li key={p.id} className="grid grid-cols-1 gap-2 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_9rem_8rem] sm:items-center sm:gap-4">
                      <div className="min-w-0">
                        <Link href={`/projects/${p.id}`} className="block truncate text-sm font-medium hover:text-brand">
                          {p.name}
                        </Link>
                        <span className="block truncate text-xs text-muted">{p.client?.name ?? "Internal"}</span>
                      </div>
                      <div>
                        <div className="mb-1 flex justify-between text-[11px] text-muted">
                          <span>
                            {done}/{total} tasks
                          </span>
                          <span>{total ? Math.round((done / total) * 100) : 0}%</span>
                        </div>
                        <ProgressBar value={done} max={Math.max(1, total)} tone={total && done === total ? "success" : "brand"} />
                      </div>
                      <div className="flex items-center justify-between gap-2 sm:justify-end">
                        <HealthBadge health={p.health} />
                        <span className={cx("text-xs", left !== null && left < 0 ? "text-danger" : "text-muted")}>
                          {left === null ? "No deadline" : left < 0 ? `${-left}d late` : left === 0 ? "Due today" : `${left}d left`}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          {/* Workload */}
          <Panel
            title="Team workload"
            action={
              <Link href="/reports" className="text-xs text-brand hover:underline">
                Details →
              </Link>
            }
          >
            {workload.length === 0 ? (
              <p className="text-sm text-muted">No team members yet.</p>
            ) : (
              <ul className="space-y-3">
                {workload.map((w) => (
                  <li key={w.id}>
                    <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <Avatar name={w.name} size="sm" src={w.image} />
                        <span className="truncate">{w.name}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted">
                        {w.open} open{w.overdue ? <span className="text-danger"> · {w.overdue} late</span> : null}
                      </span>
                    </div>
                    <ProgressBar value={w.open} max={maxOpen} tone={w.overdue ? "warn" : "brand"} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* Decisions */}
          <Panel
            title="Recent decisions"
            action={
              <Link href="/decisions" className="text-xs text-brand hover:underline">
                All →
              </Link>
            }
          >
            {decisions.length === 0 ? (
              <p className="text-sm text-muted">No decisions logged yet. Record the “why” behind your calls.</p>
            ) : (
              <ul className="space-y-3">
                {decisions.map((d) => (
                  <li key={d.id} className="text-sm">
                    <span className="block truncate font-medium">{d.title}</span>
                    <span className="block text-xs text-muted">
                      {d.author.name ?? "Someone"} · {relTime(d.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* AI team */}
          <Panel
            title="AI team"
            action={
              <Link href="/ai/team" className="text-xs text-brand hover:underline">
                Manage →
              </Link>
            }
          >
            <ul className="space-y-2.5">
              {AI_EMPLOYEES.map((e) => {
                const on = aiOn.some((row) => row.key === e.key);
                return (
                  <li key={e.key} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span aria-hidden className={cx("h-2 w-2 shrink-0 rounded-full", e.avatarHue)} />
                      <span className="truncate">
                        {e.name} <span className="text-muted">· {e.role}</span>
                      </span>
                    </span>
                    <Badge tone={on ? "success" : "neutral"}>{on ? "On duty" : "Off"}</Badge>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4">
              <div className="mb-1 flex justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                <span>AI credits</span>
                <span>
                  {creditsUsed}/{plan.aiCreditsPerMonth}
                </span>
              </div>
              <ProgressBar value={creditsUsed} max={Math.max(1, plan.aiCreditsPerMonth)} tone={creditsUsed >= plan.aiCreditsPerMonth ? "danger" : "brand"} />
            </div>
          </Panel>

          {/* Quick actions */}
          <Panel title="Quick actions">
            <div className="grid grid-cols-2 gap-2">
              {quick.map((q) => (
                <Link
                  key={q.href + q.label}
                  href={q.href}
                  className="flex items-center gap-2 rounded-[var(--radius-control)] border border-border bg-surface-2 px-3 py-2 text-xs hover:border-brand"
                >
                  <Icon name={q.icon} className="h-3.5 w-3.5 shrink-0 text-brand" />
                  <span className="truncate">{q.label}</span>
                </Link>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
