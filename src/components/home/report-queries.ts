import { prisma } from "@/lib/db";
import { orgMembers } from "@/lib/page";
import {
  MONTH_NAMES,
  addDaysKey,
  addMonthsKey,
  diffDays,
  fmtKey,
  invoiceGross,
  istDateTime,
  istKey,
  monthStartKey,
  todayKey,
} from "@/components/home/dates";

export type ReportPeriod = "7d" | "30d" | "90d" | "12m";
export const REPORT_PERIODS: Array<{ id: ReportPeriod; label: string; long: string }> = [
  { id: "7d", label: "7 days", long: "Last 7 days" },
  { id: "30d", label: "30 days", long: "Last 30 days" },
  { id: "90d", label: "90 days", long: "Last 90 days" },
  { id: "12m", label: "12 months", long: "Last 12 months" },
];

/** Tasks carry no time estimate, so utilisation assumes this many hours per task due within a week. */
export const ASSUMED_HOURS_PER_TASK = 3;

export function parsePeriod(v: string): ReportPeriod {
  return (REPORT_PERIODS.find((p) => p.id === v)?.id ?? "30d") as ReportPeriod;
}

export interface TeamRow {
  id: string;
  name: string;
  designation: string;
  openTasks: number;
  completed: number;
  overdue: number;
  plannedHours: number;
  capacityHours: number;
  utilisation: number | null;
}

export interface ReportData {
  period: ReportPeriod;
  periodLabel: string;
  startKey: string;
  endKey: string;
  start: Date;
  end: Date;
  buckets: Array<{ label: string; revenue: number; expenses: number }>;
  kpis: {
    collected: number;
    invoiced: number;
    outstanding: number;
    overdue: number;
    expenses: number;
    net: number;
    newClients: number;
    projectsCompleted: number;
    tasksCompleted: number;
  };
  statuses: Array<{ status: string; count: number; amount: number }>;
  clients: Array<{ id: string; name: string; collected: number; invoices: number }>;
  projects: Array<{ id: string; name: string; tasksDone: number; collected: number }>;
  team: TeamRow[];
}

export function periodRange(period: ReportPeriod): { startKey: string; endKey: string } {
  const today = todayKey();
  if (period === "12m") {
    const first = addMonthsKey(monthStartKey(today), -11);
    return { startKey: first, endKey: addMonthsKey(monthStartKey(today), 1) };
  }
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  return { startKey: addDaysKey(today, -(days - 1)), endKey: addDaysKey(today, 1) };
}

export async function loadReport(orgId: string, period: ReportPeriod): Promise<ReportData> {
  const today = todayKey();
  const { startKey, endKey } = periodRange(period);
  const start = istDateTime(startKey, "00:00");
  const end = istDateTime(endKey, "00:00");
  const todayStart = istDateTime(today, "00:00");
  const weekAhead = istDateTime(addDaysKey(today, 7), "00:00");
  const inRange = { gte: start, lt: end };

  const [paid, issued, outstandingRows, expenses, newClients, projectsCompleted, tasksCompleted, members] = await Promise.all([
    prisma.invoice.findMany({
      where: { orgId, status: "PAID", updatedAt: inRange },
      select: { clientId: true, projectId: true, amountMinor: true, gstRateBps: true, updatedAt: true },
    }),
    prisma.invoice.findMany({
      where: { orgId, OR: [{ issuedAt: inRange }, { issuedAt: null, createdAt: inRange }] },
      select: { status: true, amountMinor: true, gstRateBps: true },
    }),
    prisma.invoice.findMany({
      where: { orgId, status: { in: ["SENT", "OVERDUE"] } },
      select: { amountMinor: true, gstRateBps: true, dueAt: true },
    }),
    prisma.expense.findMany({ where: { orgId, spentOn: inRange }, select: { amountMinor: true, spentOn: true } }),
    prisma.client.count({ where: { orgId, createdAt: inRange } }),
    prisma.project.count({ where: { orgId, status: "COMPLETED", updatedAt: inRange } }),
    prisma.task.findMany({ where: { orgId, status: "DONE", updatedAt: inRange }, select: { assigneeId: true, projectId: true } }),
    orgMembers(orgId),
  ]);

  // ── buckets ──
  const bucketDefs: Array<{ label: string; from: Date; to: Date }> = [];
  if (period === "12m") {
    for (let i = 0; i < 12; i++) {
      const k = addMonthsKey(startKey, i);
      bucketDefs.push({ label: MONTH_NAMES[Number(k.slice(5, 7)) - 1].slice(0, 3), from: istDateTime(k, "00:00"), to: istDateTime(addMonthsKey(k, 1), "00:00") });
    }
  } else {
    const step = period === "7d" ? 1 : 7;
    const total = diffDays(endKey, startKey);
    for (let i = 0; i < total; i += step) {
      const k = addDaysKey(startKey, i);
      const next = addDaysKey(k, Math.min(step, total - i));
      bucketDefs.push({
        label: step === 1 ? fmtKey(k, { weekday: "short", day: "numeric" }) : fmtKey(k, { day: "numeric", month: "short" }),
        from: istDateTime(k, "00:00"),
        to: istDateTime(next, "00:00"),
      });
    }
  }
  const buckets = bucketDefs.map((b) => ({ label: b.label, revenue: 0, expenses: 0 }));
  const bucketOf = (d: Date) => bucketDefs.findIndex((b) => d >= b.from && d < b.to);
  for (const inv of paid) {
    const i = bucketOf(inv.updatedAt);
    if (i >= 0) buckets[i].revenue += invoiceGross(inv);
  }
  for (const e of expenses) {
    const i = bucketOf(e.spentOn);
    if (i >= 0) buckets[i].expenses += e.amountMinor;
  }

  const collected = paid.reduce((s, i) => s + invoiceGross(i), 0);
  const expenseTotal = expenses.reduce((s, e) => s + e.amountMinor, 0);
  const invoiced = issued.filter((i) => i.status !== "DRAFT").reduce((s, i) => s + invoiceGross(i), 0);
  const outstanding = outstandingRows.reduce((s, i) => s + invoiceGross(i), 0);
  const overdue = outstandingRows.filter((i) => i.dueAt && i.dueAt < todayStart).reduce((s, i) => s + invoiceGross(i), 0);

  const statusMap = new Map<string, { count: number; amount: number }>();
  for (const s of ["DRAFT", "SENT", "OVERDUE", "PAID"]) statusMap.set(s, { count: 0, amount: 0 });
  for (const i of issued) {
    const row = statusMap.get(i.status) ?? { count: 0, amount: 0 };
    row.count += 1;
    row.amount += invoiceGross(i);
    statusMap.set(i.status, row);
  }

  // ── leaderboards ──
  const byClient = new Map<string, { collected: number; invoices: number }>();
  const byProject = new Map<string, { tasksDone: number; collected: number }>();
  for (const inv of paid) {
    const c = byClient.get(inv.clientId) ?? { collected: 0, invoices: 0 };
    c.collected += invoiceGross(inv);
    c.invoices += 1;
    byClient.set(inv.clientId, c);
    if (inv.projectId) {
      const p = byProject.get(inv.projectId) ?? { tasksDone: 0, collected: 0 };
      p.collected += invoiceGross(inv);
      byProject.set(inv.projectId, p);
    }
  }
  for (const t of tasksCompleted) {
    if (!t.projectId) continue;
    const p = byProject.get(t.projectId) ?? { tasksDone: 0, collected: 0 };
    p.tasksDone += 1;
    byProject.set(t.projectId, p);
  }
  const topClientIds = [...byClient.entries()].sort((a, b) => b[1].collected - a[1].collected).slice(0, 8);
  const topProjectIds = [...byProject.entries()].sort((a, b) => b[1].collected - a[1].collected || b[1].tasksDone - a[1].tasksDone).slice(0, 8);
  const [clientRows, projectRows] = await Promise.all([
    topClientIds.length ? prisma.client.findMany({ where: { orgId, id: { in: topClientIds.map(([id]) => id) } }, select: { id: true, name: true } }) : Promise.resolve([]),
    topProjectIds.length ? prisma.project.findMany({ where: { orgId, id: { in: topProjectIds.map(([id]) => id) } }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);
  const clientName = new Map(clientRows.map((c) => [c.id, c.name]));
  const projectName = new Map(projectRows.map((p) => [p.id, p.name]));

  // ── team ──
  const [openBy, overdueBy, weekBy] = await Promise.all([
    prisma.task.groupBy({ by: ["assigneeId"], where: { orgId, status: { not: "DONE" }, assigneeId: { not: null } }, _count: { _all: true } }),
    prisma.task.groupBy({ by: ["assigneeId"], where: { orgId, status: { not: "DONE" }, assigneeId: { not: null }, dueDate: { lt: todayStart } }, _count: { _all: true } }),
    prisma.task.groupBy({ by: ["assigneeId"], where: { orgId, status: { not: "DONE" }, assigneeId: { not: null }, dueDate: { lt: weekAhead } }, _count: { _all: true } }),
  ]);
  const count = (rows: Array<{ assigneeId: string | null; _count: { _all: number } }>, id: string) => rows.find((r) => r.assigneeId === id)?._count._all ?? 0;
  const doneBy = new Map<string, number>();
  for (const t of tasksCompleted) if (t.assigneeId) doneBy.set(t.assigneeId, (doneBy.get(t.assigneeId) ?? 0) + 1);

  const team: TeamRow[] = members.map((m) => {
    const planned = count(weekBy, m.id) * ASSUMED_HOURS_PER_TASK;
    const cap = m.weeklyCapacityHours ?? 0;
    return {
      id: m.id,
      name: m.name ?? m.email,
      designation: m.designation ?? "",
      openTasks: count(openBy, m.id),
      completed: doneBy.get(m.id) ?? 0,
      overdue: count(overdueBy, m.id),
      plannedHours: planned,
      capacityHours: cap,
      utilisation: cap > 0 ? Math.round((planned / cap) * 100) : null,
    };
  });

  return {
    period,
    periodLabel: REPORT_PERIODS.find((p) => p.id === period)?.long ?? "",
    startKey,
    endKey,
    start,
    end,
    buckets,
    kpis: {
      collected,
      invoiced,
      outstanding,
      overdue,
      expenses: expenseTotal,
      net: collected - expenseTotal,
      newClients,
      projectsCompleted,
      tasksCompleted: tasksCompleted.length,
    },
    statuses: [...statusMap.entries()].map(([status, v]) => ({ status, ...v })),
    clients: topClientIds.map(([id, v]) => ({ id, name: clientName.get(id) ?? "Unknown client", ...v })),
    projects: topProjectIds.map(([id, v]) => ({ id, name: projectName.get(id) ?? "Unknown project", ...v })),
    team,
  };
}

/** Date label for the period shown in headers. */
export function rangeLabel(r: ReportData): string {
  const last = addDaysKey(r.endKey, -1);
  return `${fmtKey(r.startKey, { day: "numeric", month: "short", year: "numeric" })} – ${fmtKey(last, { day: "numeric", month: "short", year: "numeric" })}`;
}

export { istKey };
