/**
 * Date helpers for the Home module.
 *
 * Calendar days are handled as "YYYY-MM-DD" keys. Date-only values stored in
 * the database (task due dates, project deadlines, goal periods) are UTC
 * midnight, so their key is the ISO slice. Timed values (calendar events) are
 * entered and shown in India Standard Time (UTC+05:30), so their key is
 * computed after shifting by that offset.
 */

export const IST_MIN = 330;
const DAY_MS = 86_400_000;

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
export const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Key of a date-only value (stored as UTC midnight). */
export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Key of an instant, as seen in IST. */
export function istKey(d: Date): string {
  return new Date(d.getTime() + IST_MIN * 60_000).toISOString().slice(0, 10);
}

export function todayKey(): string {
  return istKey(new Date());
}

/** "HH:MM" of an instant in IST. */
export function istTime(d: Date): string {
  return new Date(d.getTime() + IST_MIN * 60_000).toISOString().slice(11, 16);
}

export function isKey(v: string | null | undefined): v is string {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export function parseKey(v: string | null | undefined, fallback: string): string {
  return isKey(v) ? v : fallback;
}

/** UTC midnight of a key. */
export function keyToDate(key: string): Date {
  return new Date(`${key}T00:00:00Z`);
}

/** Instant for a key + "HH:MM" interpreted in IST. */
export function istDateTime(key: string, hhmm: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  const [h, mi] = (/^\d{1,2}:\d{2}$/.test(hhmm) ? hhmm : "00:00").split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, h, mi) - IST_MIN * 60_000);
}

export function addDaysKey(key: string, n: number): string {
  return new Date(keyToDate(key).getTime() + n * DAY_MS).toISOString().slice(0, 10);
}

export function diffDays(a: string, b: string): number {
  return Math.round((keyToDate(a).getTime() - keyToDate(b).getTime()) / DAY_MS);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(key: string): number {
  return (keyToDate(key).getUTCDay() + 6) % 7;
}

export function startOfWeekKey(key: string): string {
  return addDaysKey(key, -weekdayIndex(key));
}

export function monthStartKey(key: string): string {
  return `${key.slice(0, 7)}-01`;
}

export function addMonthsKey(key: string, n: number): string {
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7)) - 1 + n;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${String(yy).padStart(4, "0")}-${String(mm + 1).padStart(2, "0")}-01`;
}

export function daysInMonth(key: string): number {
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7));
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function quarterStartKey(key: string): string {
  const y = key.slice(0, 4);
  const m = Number(key.slice(5, 7));
  const qm = Math.floor((m - 1) / 3) * 3 + 1;
  return `${y}-${String(qm).padStart(2, "0")}-01`;
}

export type GoalPeriod = "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY";
export const GOAL_PERIODS: GoalPeriod[] = ["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY"];

export function periodStartKey(period: GoalPeriod, today: string): string {
  switch (period) {
    case "DAILY": return today;
    case "WEEKLY": return startOfWeekKey(today);
    case "MONTHLY": return monthStartKey(today);
    case "QUARTERLY": return quarterStartKey(today);
  }
}

export function periodLabel(period: GoalPeriod, startKey: string): string {
  switch (period) {
    case "DAILY": return fmtKey(startKey, { weekday: "long", day: "numeric", month: "long" });
    case "WEEKLY": return `Week of ${fmtKey(startKey, { day: "numeric", month: "short" })}`;
    case "MONTHLY": return fmtKey(startKey, { month: "long", year: "numeric" });
    case "QUARTERLY": return `Q${Math.floor((Number(startKey.slice(5, 7)) - 1) / 3) + 1} ${startKey.slice(0, 4)}`;
  }
}

export function fmtKey(key: string, opts: Intl.DateTimeFormatOptions): string {
  return keyToDate(key).toLocaleDateString("en-IN", { ...opts, timeZone: "UTC" });
}

export type DueBucket = "overdue" | "today" | "week" | "later" | "none";

export function dueBucket(due: Date | null | undefined, today: string): DueBucket {
  if (!due) return "none";
  const k = dayKey(due);
  if (k < today) return "overdue";
  if (k === today) return "today";
  if (k <= addDaysKey(today, 7)) return "week";
  return "later";
}

export const DUE_BUCKET_LABEL: Record<DueBucket, string> = {
  overdue: "Overdue",
  today: "Today",
  week: "This week",
  later: "Later",
  none: "No date",
};

/** Gross invoice value (net + GST) in paise. */
export function invoiceGross(inv: { amountMinor: number; gstRateBps: number }): number {
  return inv.amountMinor + Math.round((inv.amountMinor * inv.gstRateBps) / 10_000);
}
