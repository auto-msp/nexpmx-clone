/** Shared option lists for project / task UI (plain module: server + client safe). */

export const TASK_STATUSES = ["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"] as const;
export type TaskStatusKey = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABEL: Record<TaskStatusKey, string> = {
  BACKLOG: "Backlog",
  TODO: "To do",
  IN_PROGRESS: "In progress",
  IN_REVIEW: "In review",
  DONE: "Done",
};

/** Dot colour per status column (token based). */
export const TASK_STATUS_DOT: Record<TaskStatusKey, string> = {
  BACKLOG: "bg-muted",
  TODO: "bg-brand",
  IN_PROGRESS: "bg-warn",
  IN_REVIEW: "bg-brand/50",
  DONE: "bg-success",
};

export const TASK_PRIORITIES = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
] as const;

export const PRIORITY_TONE: Record<string, string> = {
  LOW: "bg-muted",
  MEDIUM: "bg-brand",
  HIGH: "bg-warn",
  URGENT: "bg-danger",
};

export const PROJECT_TYPES = [
  { value: "FIXED_PRICE", label: "Fixed price" },
  { value: "HOURLY", label: "Hourly" },
  { value: "RETAINER", label: "Retainer" },
] as const;

export const PROJECT_STATUSES = [
  { value: "PLANNING", label: "Planning" },
  { value: "ACTIVE", label: "Active" },
  { value: "PAUSED", label: "Paused" },
  { value: "COMPLETED", label: "Completed" },
] as const;

export const PROJECT_HEALTH = [
  { value: "ON_TRACK", label: "On track" },
  { value: "WATCH", label: "Watch" },
  { value: "AT_RISK", label: "At risk" },
] as const;

export function projectTypeLabel(v: string): string {
  return PROJECT_TYPES.find((t) => t.value === v)?.label ?? v;
}

export const EXPENSE_CATEGORIES = [
  "Software",
  "Contractors",
  "Hosting",
  "Travel",
  "Equipment",
  "Marketing",
  "Printing",
  "Other",
] as const;
