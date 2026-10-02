import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { pageContext } from "@/lib/page";
import { sp } from "@/lib/format";
import { cx } from "@/components/ui";
import { PageHeader, PillTabs } from "@/components/kit";
import { Icon } from "@/components/kit-icons";
import { NewEventButton } from "@/components/home/calendar-client";
import { AgendaView, DayView, MonthView, WeekView, YearView } from "@/components/home/calendar-views";
import { AGENDA_DAYS, CALENDAR_VIEWS, calendarRange, loadCalendar, type CalendarView } from "@/components/home/calendar-data";
import { ITEM_KINDS, KIND_META } from "@/components/home/calendar-types";
import { MONTH_NAMES, addDaysKey, addMonthsKey, fmtKey, monthStartKey, parseKey, startOfWeekKey, todayKey } from "@/components/home/dates";

export const metadata: Metadata = { title: "Calendar", robots: { index: false } };

const VIEW_LABEL: Record<CalendarView, string> = { month: "Month", week: "Week", day: "Day", agenda: "Agenda", year: "Year" };
const VALID_HIDE = new Set(ITEM_KINDS.map((k) => KIND_META[k].hide));

function shift(view: CalendarView, focus: string, dir: 1 | -1): string {
  switch (view) {
    case "month": return addMonthsKey(monthStartKey(focus), dir);
    case "week": return addDaysKey(focus, 7 * dir);
    case "day": return addDaysKey(focus, dir);
    case "agenda": return addDaysKey(focus, AGENDA_DAYS * dir);
    case "year": return addMonthsKey(focus, 12 * dir);
  }
}

function titleFor(view: CalendarView, focus: string): string {
  switch (view) {
    case "month": return `${MONTH_NAMES[Number(focus.slice(5, 7)) - 1]} ${focus.slice(0, 4)}`;
    case "week": {
      const s = startOfWeekKey(focus);
      const e = addDaysKey(s, 6);
      return `${fmtKey(s, { day: "numeric", month: "short" })} – ${fmtKey(e, { day: "numeric", month: "short", year: "numeric" })}`;
    }
    case "day": return fmtKey(focus, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    case "agenda": return `Next ${AGENDA_DAYS} days from ${fmtKey(focus, { day: "numeric", month: "short" })}`;
    case "year": return focus.slice(0, 4);
  }
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { orgId, userId, role, canWrite } = await pageContext("task:write");
  const q = await searchParams;
  const today = todayKey();
  const requested = sp(q.view);
  const view: CalendarView = (CALENDAR_VIEWS as string[]).includes(requested) ? (requested as CalendarView) : "month";
  const focus = parseKey(sp(q.date), today);
  const hide = new Set(
    sp(q.hide)
      .split(",")
      .map((s) => s.trim())
      .filter((s) => VALID_HIDE.has(s)),
  );

  const href = (v: CalendarView, date: string, nextHide: Set<string> = hide) => {
    const p = new URLSearchParams({ view: v, date });
    if (nextHide.size) p.set("hide", [...nextHide].join(","));
    return `/calendar?${p.toString()}`;
  };

  const { startKey, endKey } = calendarRange(view, focus);
  const [data, clients] = await Promise.all([
    loadCalendar({ orgId, userId, role, startKey, endKey, hide }),
    prisma.client.findMany({ where: { orgId, status: "ACTIVE" }, orderBy: { name: "asc" }, take: 300, select: { id: true, name: true } }),
  ]);

  const newEventDate = view === "month" || view === "year" || view === "agenda" ? (focus.slice(0, 7) === today.slice(0, 7) ? today : monthStartKey(focus)) : focus;
  const newEvent = <NewEventButton defaultDate={newEventDate} clients={clients} />;
  const viewProps = { data, today, focus, href: (v: CalendarView, d: string) => href(v, d), clients, canWrite };

  const navBtn = "inline-flex h-9 items-center justify-center rounded-[var(--radius-control)] border border-border bg-surface-2 px-3 text-sm text-text hover:border-brand";

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Calendar" subtitle="Meetings, follow-ups and time off — with task, invoice and project dates alongside." actions={canWrite ? newEvent : undefined} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={href(view, shift(view, focus, -1))} aria-label="Previous" className={cx(navBtn, "w-9 px-0")}>
            <Icon name="chevronLeft" className="h-4 w-4" />
          </Link>
          <Link href={href(view, today)} className={navBtn}>
            Today
          </Link>
          <Link href={href(view, shift(view, focus, 1))} aria-label="Next" className={cx(navBtn, "w-9 px-0")}>
            <Icon name="chevronRight" className="h-4 w-4" />
          </Link>
          <h2 className="ml-1 text-lg font-semibold tracking-tight">{titleFor(view, focus)}</h2>
        </div>
        <PillTabs items={CALENDAR_VIEWS.map((v) => ({ href: href(v, focus), label: VIEW_LABEL[v], active: v === view }))} />
      </div>

      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-2" aria-label="Calendars">
        {ITEM_KINDS.map((k) => {
          const meta = KIND_META[k];
          const off = hide.has(meta.hide);
          const next = new Set(hide);
          if (off) next.delete(meta.hide);
          else next.add(meta.hide);
          return (
            <Link
              key={k}
              href={href(view, focus, next)}
              aria-pressed={!off}
              title={off ? `Show ${meta.plural.toLowerCase()}` : `Hide ${meta.plural.toLowerCase()}`}
              className={cx("inline-flex items-center gap-1.5 text-xs", off ? "text-muted/60 line-through" : "text-muted hover:text-text")}
            >
              <span aria-hidden className={cx("h-2.5 w-2.5 rounded-full", meta.dot, off && "opacity-40")} />
              {meta.plural}
              {!off ? <span className="font-mono text-[10px]">{data.counts[k]}</span> : null}
            </Link>
          );
        })}
      </div>

      {view === "month" ? <MonthView {...viewProps} /> : null}
      {view === "week" ? <WeekView {...viewProps} /> : null}
      {view === "day" ? <DayView {...viewProps} newEvent={newEvent} /> : null}
      {view === "agenda" ? <AgendaView {...viewProps} newEvent={newEvent} /> : null}
      {view === "year" ? <YearView {...viewProps} /> : null}
    </div>
  );
}
