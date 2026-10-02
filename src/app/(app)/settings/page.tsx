import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { pageContext } from "@/lib/page";
import { planOf } from "@/lib/plans";
import { getOrCreateSubscription, subscriptionView } from "@/lib/subscription";
import { fmtDate } from "@/lib/format";
import { PageHeader, Panel, FormGrid, Avatar, DetailRow } from "@/components/kit";
import { ActionForm } from "@/components/kit-client";
import { Badge, Field, Input } from "@/components/ui";
import { updateProfile } from "@/app/actions/settings";

export const metadata: Metadata = { title: "Profile settings", robots: { index: false } };

export default async function ProfileSettingsPage() {
  const { orgId, userId, role, canWrite: canManage } = await pageContext("org:manage");

  const [user, org, sub] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, image: true, designation: true, phone: true, weeklyCapacityHours: true },
    }),
    prisma.organization.findUnique({ where: { id: orgId }, select: { name: true, slug: true, plan: true, createdAt: true } }),
    getOrCreateSubscription(orgId),
  ]);
  const plan = planOf(org?.plan);
  const trial = subscriptionView(sub);

  return (
    <>
      <PageHeader title="Settings" subtitle="Manage how you appear in the workspace and how the workspace is set up." />

      <div className="space-y-6">
        <Panel title="Your profile">
          <p className="mb-4 text-sm text-muted">How you appear across the workspace: in messages, tasks and the team directory.</p>
          <div className="mb-5 flex items-center gap-4">
            <Avatar name={user?.name ?? user?.email} size="lg" src={user?.image} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{user?.name ?? "Unnamed member"}</p>
              <p className="truncate text-xs text-muted">{user?.designation || "No designation set"}</p>
            </div>
            <Badge tone="brand">{role.toLowerCase()}</Badge>
          </div>
          <ActionForm action={updateProfile} submitLabel="Save changes" pendingLabel="Saving…" resetOnSuccess={false}>
            <FormGrid>
              <Field label="Full name *">
                <Input name="name" required maxLength={80} defaultValue={user?.name ?? ""} autoComplete="name" />
              </Field>
              <div className="flex flex-col gap-1.5">
                <Field label="Email">
                  <Input value={user?.email ?? ""} readOnly disabled aria-describedby="email-help" />
                </Field>
                <span id="email-help" className="text-[11px] text-muted">
                  Your email is your sign-in and can&apos;t be changed here.
                </span>
              </div>
              <Field label="Designation">
                <Input name="designation" maxLength={80} defaultValue={user?.designation ?? ""} placeholder="Senior designer" />
              </Field>
              <Field label="Phone">
                <Input name="phone" type="tel" maxLength={24} defaultValue={user?.phone ?? ""} placeholder="+91 98765 43210" autoComplete="tel" />
              </Field>
              <div className="flex flex-col gap-1.5">
                <Field label="Weekly capacity (hours)">
                  <Input name="weeklyCapacityHours" type="number" min={0} max={168} step={1} defaultValue={user?.weeklyCapacityHours ?? 40} />
                </Field>
                <span className="text-[11px] text-muted">Used for workload views in the team directory.</span>
              </div>
            </FormGrid>
          </ActionForm>
        </Panel>

        <Panel
          title="Workspace"
          action={
            <Link href="/settings/company" className="text-xs text-brand hover:underline">
              {canManage ? "Edit company details" : "View company details"}
            </Link>
          }
        >
          <div className="divide-y divide-border">
            <DetailRow label="Name">{org?.name}</DetailRow>
            <DetailRow label="Workspace address">
              <span className="font-mono text-xs">{org?.slug}</span>
            </DetailRow>
            <DetailRow label="Plan">
              <Badge tone="brand">{plan.name}</Badge>{" "}
              {trial.state === "TRIALING" && !trial.expired && trial.daysRemaining !== null ? (
                <span className="text-xs text-muted">
                  Trial: {trial.daysRemaining} {trial.daysRemaining === 1 ? "day" : "days"} left
                </span>
              ) : null}
            </DetailRow>
            <DetailRow label="Your role">{role.toLowerCase()}</DetailRow>
            <DetailRow label="Created">{fmtDate(org?.createdAt)}</DetailRow>
          </div>
        </Panel>
      </div>
    </>
  );
}
