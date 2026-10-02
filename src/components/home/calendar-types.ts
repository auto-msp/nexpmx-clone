export type EventKind = "MEETING" | "FOLLOW_UP" | "LEAVE";
export type OverlayKind = "TASK" | "INVOICE" | "PROJECT";
export type ItemKind = EventKind | OverlayKind;

export interface EventData {
  id: string;
  title: string;
  kind: EventKind;
  /** yyyy-mm-dd (IST) */
  date: string;
  /** yyyy-mm-dd (IST), equals date for single-day events */
  endDate: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  location: string;
  notes: string;
  clientId: string;
  clientName: string;
  canManage: boolean;
}

export interface CalItem {
  key: string;
  kind: ItemKind;
  title: string;
  /** "All day", "14:30" or "14:30–15:30" for events; empty for overlays */
  time: string;
  /** Secondary text, e.g. client name or "Invoice due" */
  sub: string;
  href?: string;
  event?: EventData;
}

export const KIND_META: Record<ItemKind, { label: string; plural: string; hide: string; dot: string; chip: string }> = {
  MEETING: { label: "Meeting", plural: "Meetings", hide: "meeting", dot: "bg-brand", chip: "bg-brand/15 text-brand" },
  FOLLOW_UP: { label: "Follow-up", plural: "Follow-ups", hide: "followup", dot: "bg-warn", chip: "bg-warn/15 text-warn" },
  LEAVE: { label: "Leave", plural: "Leave", hide: "leave", dot: "bg-success", chip: "bg-success/15 text-success" },
  TASK: { label: "Task due", plural: "Task due dates", hide: "task", dot: "bg-muted", chip: "bg-surface-2 text-muted" },
  INVOICE: { label: "Invoice due", plural: "Invoice due dates", hide: "invoice", dot: "bg-danger", chip: "bg-danger/15 text-danger" },
  PROJECT: { label: "Project deadline", plural: "Project deadlines", hide: "project", dot: "bg-brand/50", chip: "border border-dashed border-brand/50 text-brand" },
};

export const ITEM_KINDS: ItemKind[] = ["MEETING", "FOLLOW_UP", "LEAVE", "TASK", "INVOICE", "PROJECT"];
export const EVENT_KINDS: EventKind[] = ["MEETING", "FOLLOW_UP", "LEAVE"];
