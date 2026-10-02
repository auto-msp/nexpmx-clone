import { daysFromNow } from "@/lib/format";

export type DeadlineTone = "muted" | "warn" | "danger" | "success";

/** Human countdown for a project deadline ("5 days left", "3 days overdue"). */
export function deadlineInfo(deadline: Date | null, status: string): { text: string; tone: DeadlineTone } {
  if (status === "COMPLETED") return { text: "Completed", tone: "success" };
  const n = daysFromNow(deadline);
  if (n === null) return { text: "No deadline", tone: "muted" };
  if (n < 0) return { text: `${Math.abs(n)} day${Math.abs(n) === 1 ? "" : "s"} overdue`, tone: "danger" };
  if (n === 0) return { text: "Due today", tone: "warn" };
  if (n <= 7) return { text: `${n} day${n === 1 ? "" : "s"} left`, tone: "warn" };
  return { text: `${n} days left`, tone: "muted" };
}

export const DEADLINE_TEXT: Record<DeadlineTone, string> = {
  muted: "text-muted",
  warn: "text-warn",
  danger: "text-danger",
  success: "text-success",
};
