import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { getOrgContext } from "@/lib/tenancy";
import { prisma } from "@/lib/db";
import { Badge, Card, SectionTitle } from "@/components/ui";
import { updateNotificationPreferences } from "@/app/actions/settings-extended";
import { SubmitButton } from "@/components/submit-button";

export const metadata: Metadata = { title: "Notifications", robots: { index: false } };

export default async function NotificationsPage() {
  const session = await auth();
  const ctx = await getOrgContext(session!.user!.id);

  const org = await prisma.organization.findUnique({
    where: { id: ctx!.orgId },
    select: {
      notifyPayments: true,
      notifyProposals: true,
      notifyMilestones: true,
      notifyWeeklyDigest: true,
    },
  });

  const recent = await prisma.notification.findMany({
    where: { orgId: ctx!.orgId, userId: ctx!.userId },
    orderBy: { createdAt: "desc" },
    take: 15,
  });

  const toggles = [
    {
      name: "notifyPayments",
      label: "Payment events",
      hint: "Invoices marked paid, payment failures.",
      checked: org?.notifyPayments ?? true,
    },
    {
      name: "notifyProposals",
      label: "Proposal events",
      hint: "Proposals sent, viewed, accepted or rejected.",
      checked: org?.notifyProposals ?? true,
    },
    {
      name: "notifyMilestones",
      label: "Milestone events",
      hint: "Milestones completed on active projects.",
      checked: org?.notifyMilestones ?? true,
    },
    {
      name: "notifyWeeklyDigest",
      label: "Weekly digest",
      hint: "Monday summary of money, delivery and memory.",
      checked: org?.notifyWeeklyDigest ?? true,
    },
  ] as const;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        <p className="mt-1 text-sm text-muted">
          Org-wide events. Automations can additionally notify founders or clients per workflow.
        </p>
      </div>

      <Card>
        <SectionTitle>Preferences</SectionTitle>
        <form action={updateNotificationPreferences} className="mt-4 space-y-4">
          {toggles.map((t) => (
            <label key={t.name} className="flex items-start justify-between gap-4 rounded-[var(--radius-control)] border border-border p-3">
              <span>
                <span className="block text-sm font-medium">{t.label}</span>
                <span className="mt-0.5 block text-xs text-muted">{t.hint}</span>
              </span>
              <input
                type="checkbox"
                name={t.name}
                defaultChecked={t.checked}
                className="mt-1 h-4 w-4 shrink-0 rounded border-border"
              />
            </label>
          ))}
          <SubmitButton pendingLabel="Saving…">Save preferences</SubmitButton>
        </form>
      </Card>

      <Card>
        <SectionTitle>Recent notifications</SectionTitle>
        {recent.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Nothing yet.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {recent.map((n) => {
              let title = n.type;
              try {
                const payload = JSON.parse(n.payloadJson) as { title?: string };
                title = payload.title ?? n.type;
              } catch {
                // keep type as title
              }
              return (
                <li key={n.id} className="flex items-center justify-between gap-2">
                  <span>
                    <Badge tone="neutral">{n.type}</Badge> <span className="ml-1">{title}</span>
                  </span>
                  <span className="flex items-center gap-2 text-xs text-muted">
                    {n.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                    {n.readAt ? null : <Badge tone="brand">new</Badge>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
