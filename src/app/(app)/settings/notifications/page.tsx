import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { pageContext } from "@/lib/page";
import { relTime } from "@/lib/format";
import { PageHeader, Panel, EmptyPanel } from "@/components/kit";
import { ActionForm } from "@/components/kit-client";
import { Badge } from "@/components/ui";
import { updateNotificationPreferences } from "@/app/actions/settings-extended";

export const metadata: Metadata = { title: "Notification settings", robots: { index: false } };

export default async function NotificationsPage() {
  const { orgId, userId, canWrite: canManage } = await pageContext("org:manage");

  const [org, recent] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: orgId },
      select: { notifyPayments: true, notifyProposals: true, notifyMilestones: true, notifyWeeklyDigest: true },
    }),
    prisma.notification.findMany({ where: { orgId, userId }, orderBy: { createdAt: "desc" }, take: 15 }),
  ]);

  const toggles = [
    { name: "notifyPayments", label: "Payment events", hint: "Invoices marked paid and payment failures.", checked: org?.notifyPayments ?? true },
    { name: "notifyProposals", label: "Proposal events", hint: "Proposals sent, viewed, accepted or rejected.", checked: org?.notifyProposals ?? true },
    { name: "notifyMilestones", label: "Milestone events", hint: "Milestones completed on active projects.", checked: org?.notifyMilestones ?? true },
    { name: "notifyWeeklyDigest", label: "Weekly digest", hint: "A Monday summary of money, delivery and memory.", checked: org?.notifyWeeklyDigest ?? true },
  ];

  return (
    <>
      <PageHeader title="Notifications" subtitle="Choose which workspace events raise a notification. Automations can also notify people per workflow." />
      <div className="space-y-6">
        <Panel title="Workspace events">
          {!canManage ? <p className="mb-3 rounded-[var(--radius-control)] bg-surface-2 px-3 py-2 text-xs text-muted">These apply to the whole workspace. Only the owner can change them.</p> : null}
          <ActionForm action={updateNotificationPreferences} submitLabel="Save preferences" pendingLabel="Saving…" hideSubmit={!canManage} resetOnSuccess={false}>
            {toggles.map((t) => (
              <label key={t.name} className="flex items-start justify-between gap-4 rounded-[var(--radius-control)] border border-border p-3">
                <span>
                  <span className="block text-sm font-medium">{t.label}</span>
                  <span className="mt-0.5 block text-xs text-muted">{t.hint}</span>
                </span>
                <input type="checkbox" name={t.name} defaultChecked={t.checked} disabled={!canManage} className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-brand)]" />
              </label>
            ))}
          </ActionForm>
        </Panel>

        <Panel title="Recent notifications" flush>
          {recent.length === 0 ? (
            <div className="p-5">
              <EmptyPanel icon="bell" title="Nothing yet" hint="Events you opted into will show up here." />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {recent.map((n) => {
                let title = n.type;
                try {
                  const payload = JSON.parse(n.payloadJson) as { title?: string };
                  title = payload.title ?? n.type;
                } catch {
                  /* keep type as title */
                }
                return (
                  <li key={n.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <Badge tone="neutral">{n.type}</Badge>
                      <span className="truncate">{title}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-muted">
                      {relTime(n.createdAt)}
                      {n.readAt ? null : <Badge tone="brand">new</Badge>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
