import { prisma } from "@/lib/db";
import { addDaysKey, addMonthsKey, dayKey, daysInMonth, diffDays, istDateTime, istKey, istTime, keyToDate, monthStartKey, startOfWeekKey, weekdayIndex } from "@/components/home/dates";
import { KIND_META, type CalItem, type EventData, type EventKind, type ItemKind } from "@/components/home/calendar-types";

export interface CalendarData {
  byDay: Record<string, CalItem[]>;
  counts: Record<ItemKind, number>;
}

/**
 * Load everything shown on the calendar between startKey (inclusive) and
 * endKey (exclusive): stored events plus read-only overlays (task due dates,
 * invoice due dates, project deadlines). Everything is scoped by org.
 */
export async function loadCalendar(opts: {
  orgId: string;
  userId: string;
  role: string;
  startKey: string;
  endKey: string;
  hide: Set<string>;
}): Promise<CalendarData> {
  const { orgId, userId, role, startKey, endKey, hide } = opts;
  const rangeStart = istDateTime(startKey, "00:00");
  const rangeEnd = istDateTime(endKey, "00:00");
  const dStart = keyToDate(startKey);
  const dEnd = keyToDate(endKey);

  const [events, tasks, invoices, projects] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: { orgId, startsAt: { lt: rangeEnd }, OR: [{ startsAt: { gte: rangeStart } }, { endsAt: { gte: rangeStart } }] },
      orderBy: { startsAt: "asc" },
      take: 1500,
    }),
    prisma.task.findMany({
      where: {
        orgId,
        status: { not: "DONE" },
        dueDate: { gte: dStart, lt: dEnd },
        OR: [{ projectId: { not: null } }, { createdById: userId }, { assigneeId: userId }],
      },
      select: { id: true, title: true, dueDate: true, projectId: true, assigneeId: true },
      take: 600,
    }),
    prisma.invoice.findMany({
      where: { orgId, status: { in: ["SENT", "OVERDUE"] }, dueAt: { gte: dStart, lt: dEnd } },
      select: { id: true, number: true, dueAt: true, client: { select: { name: true } } },
      take: 300,
    }),
    prisma.project.findMany({
      where: { orgId, status: { not: "COMPLETED" }, deadline: { gte: dStart, lt: dEnd } },
      select: { id: true, name: true, deadline: true },
      take: 300,
    }),
  ]);

  const clientIds = [...new Set(events.map((e) => e.clientId).filter((x): x is string => Boolean(x)))];
  const clients = clientIds.length
    ? await prisma.client.findMany({ where: { orgId, id: { in: clientIds } }, select: { id: true, name: true } })
    : [];
  const clientName = new Map(clients.map((c) => [c.id, c.name]));

  const byDay: Record<string, CalItem[]> = {};
  const sortKey = new Map<string, string>();
  const counts: Record<ItemKind, number> = { MEETING: 0, FOLLOW_UP: 0, LEAVE: 0, TASK: 0, INVOICE: 0, PROJECT: 0 };
  const push = (day: string, item: CalItem, sort: string) => {
    if (day < startKey || day >= endKey) return;
    (byDay[day] ??= []).push(item);
    sortKey.set(`${day}|${item.key}`, sort);
  };

  for (const e of events) {
    const kind = (["MEETING", "FOLLOW_UP", "LEAVE"].includes(e.kind) ? e.kind : "MEETING") as EventKind;
    if (hide.has(KIND_META[kind].hide)) continue;
    const date = istKey(e.startsAt);
    const endDate = e.endsAt ? istKey(e.endsAt) : date;
    const startTime = e.allDay ? "" : istTime(e.startsAt);
    const endTime = e.allDay || !e.endsAt ? "" : istTime(e.endsAt);
    const data: EventData = {
      id: e.id,
      title: e.title,
      kind,
      date,
      endDate: endDate < date ? date : endDate,
      startTime,
      endTime,
      allDay: e.allDay,
      location: e.location ?? "",
      notes: e.notes ?? "",
      clientId: e.clientId ?? "",
      clientName: e.clientId ? clientName.get(e.clientId) ?? "" : "",
      canManage: e.creatorId === userId || ["OWNER", "ADMIN", "MANAGER"].includes(role),
    };
    const span = Math.min(62, Math.max(0, diffDays(data.endDate, date)));
    counts[kind] += 1;
    for (let i = 0; i <= span; i++) {
      const day = addDaysKey(date, i);
      const multi = span > 0;
      const time = e.allDay || multi ? "All day" : endTime ? `${startTime}–${endTime}` : startTime;
      push(
        day,
        { key: `e:${e.id}`, kind, title: e.title, time, sub: data.clientName, event: data },
        e.allDay || multi ? "0" : `1${startTime}`,
      );
    }
  }

  if (!hide.has(KIND_META.TASK.hide)) {
    for (const t of tasks) {
      if (!t.dueDate) continue;
      counts.TASK += 1;
      push(
        dayKey(t.dueDate),
        {
          key: `t:${t.id}`,
          kind: "TASK",
          title: t.title,
          time: "",
          sub: "Task due",
          href: t.projectId ? `/projects/${t.projectId}` : "/tasks?tab=personal",
        },
        "9t",
      );
    }
  }
  if (!hide.has(KIND_META.INVOICE.hide)) {
    for (const i of invoices) {
      if (!i.dueAt) continue;
      counts.INVOICE += 1;
      push(
        dayKey(i.dueAt),
        { key: `i:${i.id}`, kind: "INVOICE", title: `Invoice ${i.number}`, time: "", sub: i.client.name, href: `/invoices/${i.id}` },
        "9i",
      );
    }
  }
  if (!hide.has(KIND_META.PROJECT.hide)) {
    for (const p of projects) {
      if (!p.deadline) continue;
      counts.PROJECT += 1;
      push(dayKey(p.deadline), { key: `p:${p.id}`, kind: "PROJECT", title: p.name, time: "", sub: "Project deadline", href: `/projects/${p.id}` }, "9p");
    }
  }

  for (const [day, items] of Object.entries(byDay)) {
    items.sort((a, b) => (sortKey.get(`${day}|${a.key}`) ?? "").localeCompare(sortKey.get(`${day}|${b.key}`) ?? ""));
  }
  return { byDay, counts };
}

export type CalendarView = "month" | "week" | "day" | "agenda" | "year";
export const CALENDAR_VIEWS: CalendarView[] = ["month", "week", "day", "agenda", "year"];
export const AGENDA_DAYS = 30;

/** Visible range [startKey, endKey) for a view centred on `focus`. */
export function calendarRange(view: CalendarView, focus: string): { startKey: string; endKey: string } {
  switch (view) {
    case "month": {
      const first = monthStartKey(focus);
      const gridStart = startOfWeekKey(first);
      const weeks = Math.ceil((weekdayIndex(first) + daysInMonth(first)) / 7);
      return { startKey: gridStart, endKey: addDaysKey(gridStart, weeks * 7) };
    }
    case "week": {
      const s = startOfWeekKey(focus);
      return { startKey: s, endKey: addDaysKey(s, 7) };
    }
    case "day":
      return { startKey: focus, endKey: addDaysKey(focus, 1) };
    case "agenda":
      return { startKey: focus, endKey: addDaysKey(focus, AGENDA_DAYS) };
    case "year": {
      const y = `${focus.slice(0, 4)}-01-01`;
      return { startKey: y, endKey: addMonthsKey(y, 12) };
    }
  }
}
