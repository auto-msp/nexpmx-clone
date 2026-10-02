import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { pageContext } from "@/lib/page";
import { inr, relTime, sp } from "@/lib/format";
import { Badge, cx } from "@/components/ui";
import { EmptyPanel, PageHeader, Panel, TabLinks } from "@/components/kit";
import { ActionButton } from "@/components/kit-client";
import { Icon } from "@/components/kit-icons";
import { markAllNotificationsRead, markNotificationRead } from "@/app/actions/notifications";
import { addDaysKey, dayKey, diffDays, invoiceGross, todayKey } from "@/components/home/dates";

export const metadata: Metadata = { title: "Notifications", robots: { index: false } };

type Cat = "tasks" | "messages" | "projects" | "finance" | "other";
const TABS: Array<{ id: "all" | Exclude<Cat, "other">; label: string }> = [
  { id: "all", label: "All" },
  { id: "tasks", label: "Tasks" },
  { id: "messages", label: "Messages" },
  { id: "projects", label: "Projects" },
  { id: "finance", label: "Finance" },
];
const CAT_ICON: Record<Cat, string> = { tasks: "tasks", messages: "mail", projects: "folder", finance: "rupee", other: "bell" };

const TRIGGER_LABEL: Record<string, string> = {
  "invoice.paid": "Payment received",
  "proposal.signed": "Proposal signed",
  "project.created": "Project created",
  "milestone.completed": "Milestone completed",
  "task.completed": "Task completed",
};

function categoryOf(type: string, trigger?: string): Cat {
  const s = `${type} ${trigger ?? ""}`.toLowerCase();
  if (/invoice|payment|proposal|finance|expense|billing/.test(s)) return "finance";
  if (/task/.test(s)) return "tasks";
  if (/message|comms|reply|email|mention|comment/.test(s)) return "messages";
  if (/project|milestone|board|decision/.test(s)) return "projects";
  return "other";
}

function humanize(type: string): string {
  const t = type.replace(/[._-]+/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "Notification";
}

interface Entry {
  id: string;
  cat: Cat;
  title: string;
  body: string;
  href: string | null;
  at: Date;
  stored: boolean;
  unread: boolean;
}

function parsePayload(json: string): { title?: string; body?: string; href?: string; trigger?: string } {
  try {
    const v = JSON.parse(json) as Record<string, unknown>;
    const s = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim() : undefined);
    const href = s(v.href);
    return { title: s(v.title), body: s(v.body), trigger: s(v.trigger), href: href && href.startsWith("/") ? href : undefined };
  } catch {
    return {};
  }
}

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { orgId, userId } = await pageContext();
  const q = await searchParams;
  const tab = TABS.find((t) => t.id === sp(q.tab))?.id ?? "all";
  const now = new Date();
  const today = todayKey();
  const since = new Date(now.getTime() - 14 * 86_400_000);
  const soon = addDaysKey(today, 3);
  const weekAhead = addDaysKey(today, 7);

  const [stored, overdueInvoices, dueTasks, proposals, inbound, deadlines] = await Promise.all([
    prisma.notification.findMany({ where: { orgId, userId }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.invoice.findMany({
      where: { orgId, status: { in: ["SENT", "OVERDUE"] }, dueAt: { lt: new Date(`${today}T00:00:00Z`) } },
      select: { id: true, number: true, dueAt: true, amountMinor: true, gstRateBps: true, client: { select: { name: true } } },
      orderBy: { dueAt: "asc" },
      take: 10,
    }),
    prisma.task.findMany({
      where: { orgId, assigneeId: userId, status: { not: "DONE" }, dueDate: { lte: new Date(`${soon}T00:00:00Z`) } },
      select: { id: true, title: true, dueDate: true, projectId: true },
      orderBy: { dueDate: "asc" },
      take: 10,
    }),
    prisma.proposal.findMany({
      where: { orgId, status: { in: ["VIEWED", "ACCEPTED", "REJECTED"] }, updatedAt: { gte: since } },
      select: { id: true, title: true, status: true, updatedAt: true, decidedAt: true, client: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
    prisma.commsMessage.findMany({
      where: { orgId, direction: "IN", sentAt: { gte: since } },
      select: { id: true, subject: true, sentAt: true, client: { select: { name: true } } },
      orderBy: { sentAt: "desc" },
      take: 10,
    }),
    prisma.project.findMany({
      where: { orgId, status: { not: "COMPLETED" }, deadline: { gte: new Date(`${today}T00:00:00Z`), lte: new Date(`${weekAhead}T00:00:00Z`) } },
      select: { id: true, name: true, deadline: true },
      orderBy: { deadline: "asc" },
      take: 10,
    }),
  ]);

  const entries: Entry[] = [];
  for (const n of stored) {
    const p = parsePayload(n.payloadJson);
    const label = p.trigger ? TRIGGER_LABEL[p.trigger] : undefined;
    entries.push({
      id: n.id,
      cat: categoryOf(n.type, p.trigger),
      title: label && p.title ? `${label}: ${p.title}` : (p.title ?? label ?? humanize(n.type)),
      body: p.body ?? "",
      href: p.href ?? null,
      at: n.createdAt,
      stored: true,
      unread: n.readAt === null,
    });
  }
  const cap = (d: Date) => (d.getTime() > now.getTime() ? now : d);
  for (const i of overdueInvoices) {
    const days = i.dueAt ? diffDays(today, dayKey(i.dueAt)) : 0;
    entries.push({
      id: `d:inv:${i.id}`,
      cat: "finance",
      title: `Invoice ${i.number} is overdue`,
      body: `${inr(invoiceGross(i))} from ${i.client.name} · ${days} day${days === 1 ? "" : "s"} past due`,
      href: `/invoices/${i.id}`,
      at: cap(i.dueAt ?? now),
      stored: false,
      unread: false,
    });
  }
  for (const t of dueTasks) {
    const k = t.dueDate ? dayKey(t.dueDate) : today;
    const d = diffDays(k, today);
    entries.push({
      id: `d:task:${t.id}`,
      cat: "tasks",
      title: d < 0 ? `Task overdue: ${t.title}` : d === 0 ? `Due today: ${t.title}` : `Due in ${d} day${d === 1 ? "" : "s"}: ${t.title}`,
      body: d < 0 ? `${-d} day${d === -1 ? "" : "s"} past its due date` : "Assigned to you",
      href: t.projectId ? `/projects/${t.projectId}` : "/tasks",
      at: cap(t.dueDate ?? now),
      stored: false,
      unread: false,
    });
  }
  for (const p of proposals) {
    const verb = p.status === "ACCEPTED" ? "accepted" : p.status === "REJECTED" ? "declined" : "viewed";
    entries.push({
      id: `d:prop:${p.id}`,
      cat: "finance",
      title: `Proposal ${verb}: ${p.title}`,
      body: p.client?.name ? `Client: ${p.client.name}` : "",
      href: `/proposals/${p.id}`,
      at: p.decidedAt ?? p.updatedAt,
      stored: false,
      unread: false,
    });
  }
  for (const m of inbound) {
    entries.push({
      id: `d:msg:${m.id}`,
      cat: "messages",
      title: `New message${m.client?.name ? ` from ${m.client.name}` : ""}`,
      body: m.subject,
      href: "/comms",
      at: m.sentAt,
      stored: false,
      unread: false,
    });
  }
  for (const p of deadlines) {
    const d = p.deadline ? diffDays(dayKey(p.deadline), today) : 0;
    entries.push({
      id: `d:proj:${p.id}`,
      cat: "projects",
      title: `${p.name} is due ${d <= 0 ? "today" : `in ${d} day${d === 1 ? "" : "s"}`}`,
      body: "Project deadline",
      href: `/projects/${p.id}`,
      at: cap(p.deadline ?? now),
      stored: false,
      unread: false,
    });
  }
  entries.sort((a, b) => b.at.getTime() - a.at.getTime());

  const unreadBy = (c: Cat | "all") => entries.filter((e) => e.unread && (c === "all" || e.cat === c)).length;
  const shown = entries.filter((e) => tab === "all" || e.cat === tab);
  const totalUnread = unreadBy("all");

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Notifications"
        subtitle="Updates from automations plus live alerts about money, tasks, projects and messages."
        actions={
          totalUnread > 0 ? <ActionButton action={markAllNotificationsRead} fields={{}} label="Mark all read" icon="check" variant="secondary" className="px-3 py-2 text-sm" /> : null
        }
      />
      <TabLinks
        tabs={TABS.map((t) => ({
          href: t.id === "all" ? "/notifications" : `/notifications?tab=${t.id}`,
          label: t.label,
          active: tab === t.id,
          count: unreadBy(t.id) || undefined,
        }))}
      />

      {shown.length === 0 ? (
        <EmptyPanel
          icon="bell"
          title={tab === "all" ? "You're all caught up" : `Nothing in ${TABS.find((t) => t.id === tab)?.label ?? "this tab"}`}
          hint="Payments, signed proposals, completed milestones and anything overdue will show up here."
        />
      ) : (
        <Panel flush>
          <ul className="divide-y divide-border">
            {shown.map((e) => {
              const content = (
                <>
                  <span className="block truncate text-sm font-medium">{e.title}</span>
                  {e.body ? <span className="block truncate text-xs text-muted">{e.body}</span> : null}
                </>
              );
              return (
                <li key={e.id} className={cx("flex items-start gap-3 px-4 py-3", e.unread && "bg-brand/5")}>
                  <span className={cx("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full", e.unread ? "bg-brand/15 text-brand" : "bg-surface-2 text-muted")}>
                    <Icon name={CAT_ICON[e.cat]} className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    {e.href ? (
                      <Link href={e.href} className="block hover:text-brand">
                        {content}
                      </Link>
                    ) : (
                      <div>{content}</div>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                      <span>{relTime(e.at)}</span>
                      {!e.stored ? <Badge tone="neutral">Live</Badge> : null}
                      {e.unread ? <span className="text-brand">New</span> : null}
                    </div>
                  </div>
                  {e.stored && e.unread ? (
                    <ActionButton action={markNotificationRead} fields={{ id: e.id }} label="Mark read" icon="check" onlyIcon title="Mark as read" />
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
      <p className="mt-4 text-xs text-muted">
        “Live” items are generated from your current data and clear on their own once the underlying issue is resolved.
      </p>
    </div>
  );
}
