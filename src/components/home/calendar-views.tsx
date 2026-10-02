import Link from "next/link";
import { cx } from "@/components/ui";
import { EmptyPanel } from "@/components/kit";
import { EventChip, type ClientOption } from "@/components/home/calendar-client";
import { KIND_META, type CalItem } from "@/components/home/calendar-types";
import type { CalendarData, CalendarView } from "@/components/home/calendar-data";
import { AGENDA_DAYS } from "@/components/home/calendar-data";
import {
  MONTH_NAMES,
  WEEKDAY_SHORT,
  addDaysKey,
  addMonthsKey,
  daysInMonth,
  fmtKey,
  monthStartKey,
  startOfWeekKey,
  weekdayIndex,
} from "@/components/home/dates";

interface ViewProps {
  data: CalendarData;
  today: string;
  focus: string;
  href: (view: CalendarView, date: string) => string;
  clients: ClientOption[];
  canWrite: boolean;
}

function OverlayItem({ item, variant }: { item: CalItem; variant: "chip" | "row" }) {
  const meta = KIND_META[item.kind];
  const body =
    variant === "chip" ? (
      <span className={cx("flex w-full min-w-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] leading-tight hover:brightness-125", meta.chip)}>
        <span className="truncate">{item.title}</span>
      </span>
    ) : (
      <span className="flex items-start gap-3 rounded-[var(--radius-control)] border border-border bg-surface px-3 py-2 hover:border-brand">
        <span aria-hidden className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", meta.dot)} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{item.title}</span>
          <span className="block truncate text-xs text-muted">{[meta.label, item.sub && item.sub !== meta.label ? item.sub : ""].filter(Boolean).join(" · ")}</span>
        </span>
      </span>
    );
  return item.href ? (
    <Link href={item.href} title={`${meta.label}: ${item.title}`} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

function Item({ item, variant, clients, canWrite }: { item: CalItem; variant: "chip" | "row"; clients: ClientOption[]; canWrite: boolean }) {
  return item.event ? <EventChip item={item} variant={variant} clients={clients} canWrite={canWrite} /> : <OverlayItem item={item} variant={variant} />;
}

/* ── Month ─────────────────────────────────────────────────────────────── */

export function MonthView({ data, today, focus, href, clients, canWrite }: ViewProps) {
  const first = monthStartKey(focus);
  const gridStart = startOfWeekKey(first);
  const weeks = Math.ceil((weekdayIndex(first) + daysInMonth(first)) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDaysKey(gridStart, i));
  const MAX = 3;

  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
      <div className="grid grid-cols-7 border-b border-border bg-surface-2/60">
        {WEEKDAY_SHORT.map((d) => (
          <div key={d} className="px-1 py-2 text-center font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted sm:px-2 sm:text-left">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((key, i) => {
          const items = data.byDay[key] ?? [];
          const outside = key.slice(0, 7) !== first.slice(0, 7);
          const isToday = key === today;
          const extra = items.length - MAX;
          return (
            <div
              key={key}
              className={cx(
                "min-h-[4.25rem] border-b border-border p-1 sm:min-h-[7.5rem] sm:p-1.5",
                i % 7 !== 6 && "border-r",
                outside && "bg-surface-2/40",
              )}
            >
              <Link
                href={href("day", key)}
                aria-label={fmtKey(key, { weekday: "long", day: "numeric", month: "long" })}
                className={cx(
                  "mb-1 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs",
                  isToday ? "bg-brand font-semibold text-white" : outside ? "text-muted/60 hover:text-text" : "text-text hover:bg-surface-2",
                )}
              >
                {Number(key.slice(8, 10))}
              </Link>
              <div className="hidden space-y-0.5 sm:block">
                {items.slice(0, MAX).map((it) => (
                  <Item key={it.key} item={it} variant="chip" clients={clients} canWrite={canWrite} />
                ))}
                {extra > 0 ? (
                  <Link href={href("day", key)} className="block px-1.5 text-[11px] text-muted hover:text-brand">
                    +{extra} more
                  </Link>
                ) : null}
              </div>
              {items.length > 0 ? (
                <Link href={href("day", key)} className="flex flex-wrap gap-0.5 sm:hidden" aria-label={`${items.length} items`}>
                  {items.slice(0, 6).map((it) => (
                    <span key={it.key} aria-hidden className={cx("h-1.5 w-1.5 rounded-full", KIND_META[it.kind].dot)} />
                  ))}
                </Link>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Week ──────────────────────────────────────────────────────────────── */

export function WeekView({ data, today, focus, href, clients, canWrite }: ViewProps) {
  const start = startOfWeekKey(focus);
  const days = Array.from({ length: 7 }, (_, i) => addDaysKey(start, i));
  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-7">
      {days.map((key) => {
        const items = data.byDay[key] ?? [];
        const isToday = key === today;
        return (
          <section key={key} className={cx("min-h-28 rounded-[var(--radius-card)] border bg-surface p-2.5", isToday ? "border-brand" : "border-border")}>
            <Link href={href("day", key)} className="mb-2 flex items-baseline justify-between gap-2">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{fmtKey(key, { weekday: "short" })}</span>
              <span className={cx("text-sm font-semibold", isToday && "text-brand")}>{fmtKey(key, { day: "numeric", month: "short" })}</span>
            </Link>
            {items.length === 0 ? (
              <p className="text-xs text-muted/70">Free</p>
            ) : (
              <div className="space-y-1">
                {items.map((it) => (
                  <div key={it.key}>
                    {it.time && it.event && !it.event.allDay && it.time !== "All day" ? <span className="mb-0.5 block px-1 font-mono text-[10px] text-muted">{it.time}</span> : null}
                    <Item item={it} variant="chip" clients={clients} canWrite={canWrite} />
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

/* ── Day ───────────────────────────────────────────────────────────────── */

export function DayView({ data, focus, clients, canWrite, newEvent }: ViewProps & { newEvent: React.ReactNode }) {
  const items = data.byDay[focus] ?? [];
  if (items.length === 0) {
    return <EmptyPanel icon="calendar" title="Nothing scheduled" hint="No events, due dates or deadlines fall on this day." action={canWrite ? newEvent : undefined} />;
  }
  const allDay = items.filter((i) => !i.event || i.time === "All day");
  const timed = items.filter((i) => i.event && i.time !== "All day");
  return (
    <div className="space-y-5">
      {timed.length ? (
        <section>
          <h2 className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Schedule</h2>
          <ul className="space-y-2">
            {timed.map((it) => (
              <li key={it.key} className="flex items-start gap-3">
                <span className="w-24 shrink-0 pt-2 font-mono text-xs text-muted">{it.time}</span>
                <div className="min-w-0 flex-1">
                  <Item item={it} variant="row" clients={clients} canWrite={canWrite} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {allDay.length ? (
        <section>
          <h2 className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">All day &amp; due today</h2>
          <ul className="space-y-2">
            {allDay.map((it) => (
              <li key={it.key}>
                <Item item={it} variant="row" clients={clients} canWrite={canWrite} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/* ── Agenda ────────────────────────────────────────────────────────────── */

export function AgendaView({ data, today, focus, href, clients, canWrite, newEvent }: ViewProps & { newEvent: React.ReactNode }) {
  const days = Array.from({ length: AGENDA_DAYS }, (_, i) => addDaysKey(focus, i)).filter((k) => (data.byDay[k] ?? []).length > 0);
  if (days.length === 0) {
    return (
      <EmptyPanel
        icon="calendar"
        title={`Nothing in the next ${AGENDA_DAYS} days`}
        hint="Add a meeting or follow-up, or set due dates on tasks and invoices to see them here."
        action={canWrite ? newEvent : undefined}
      />
    );
  }
  return (
    <div className="space-y-5">
      {days.map((key) => (
        <section key={key} className="grid grid-cols-1 gap-2 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
          <Link href={href("day", key)} className="sm:pt-2">
            <span className={cx("block text-sm font-semibold", key === today && "text-brand")}>{key === today ? "Today" : fmtKey(key, { weekday: "long" })}</span>
            <span className="block text-xs text-muted">{fmtKey(key, { day: "numeric", month: "short", year: "numeric" })}</span>
          </Link>
          <ul className="space-y-2">
            {(data.byDay[key] ?? []).map((it) => (
              <li key={it.key}>
                <Item item={it} variant="row" clients={clients} canWrite={canWrite} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/* ── Year ──────────────────────────────────────────────────────────────── */

export function YearView({ data, today, focus, href }: ViewProps) {
  const year = focus.slice(0, 4);
  const months = Array.from({ length: 12 }, (_, i) => addMonthsKey(`${year}-01-01`, i));
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {months.map((m) => {
        const lead = weekdayIndex(m);
        const total = daysInMonth(m);
        const cells: Array<string | null> = [...Array.from({ length: lead }, () => null), ...Array.from({ length: total }, (_, i) => addDaysKey(m, i))];
        return (
          <section key={m} className="rounded-[var(--radius-card)] border border-border bg-surface p-3">
            <Link href={href("month", m)} className="mb-2 block text-sm font-semibold hover:text-brand">
              {MONTH_NAMES[Number(m.slice(5, 7)) - 1]}
            </Link>
            <div className="grid grid-cols-7 gap-0.5 text-center">
              {WEEKDAY_SHORT.map((d) => (
                <span key={d} className="pb-1 font-mono text-[9px] uppercase text-muted">
                  {d[0]}
                </span>
              ))}
              {cells.map((key, i) => {
                if (!key) return <span key={`b${i}`} />;
                const n = (data.byDay[key] ?? []).length;
                return (
                  <Link
                    key={key}
                    href={href("day", key)}
                    aria-label={`${fmtKey(key, { day: "numeric", month: "long" })}${n ? `, ${n} item${n === 1 ? "" : "s"}` : ""}`}
                    className={cx(
                      "flex h-7 items-center justify-center rounded text-[11px] hover:ring-1 hover:ring-brand",
                      n >= 4 ? "bg-brand/50 font-semibold" : n >= 2 ? "bg-brand/30" : n === 1 ? "bg-brand/15" : "text-muted",
                      key === today && "ring-1 ring-brand",
                    )}
                  >
                    {Number(key.slice(8, 10))}
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
