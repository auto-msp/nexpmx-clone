import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { pageContext } from "@/lib/page";
import { can } from "@/lib/rbac";
import { planOf } from "@/lib/plans";
import { relTime } from "@/lib/format";
import { AI_TASK_SUGGESTIONS } from "@/lib/ai-team";
import { PageHeader, Panel, EmptyPanel, ProgressBar, Pill } from "@/components/kit";
import { ActionButton, ActionForm, CopyButton, ModalButton } from "@/components/kit-client";
import { Badge } from "@/components/ui";
import { FieldLabel, Input, Textarea } from "@/components/ai/fields";
import { TeamBoard } from "@/components/ai/team-board";
import { loadTeam } from "@/components/ai/team-data";
import {
  assignAiTask,
  createCustomEmployee,
  deleteCustomEmployee,
  reviewAiTask,
  toggleAiEmployee,
  updateAiEmployee,
} from "@/app/actions/ai";

export const metadata: Metadata = { title: "AI team", robots: { index: false } };

interface TaskMeta {
  employeeKey?: string;
  employeeName?: string;
  role?: string;
  task?: string;
  draft?: string;
}

function parseMeta(json: string): TaskMeta {
  try {
    const v: unknown = JSON.parse(json);
    return v && typeof v === "object" ? (v as TaskMeta) : {};
  } catch {
    return {};
  }
}

export default async function AiTeamPage() {
  const { orgId, role, canWrite } = await pageContext("automation:write");
  const canAssign = can(role, "task:write");

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [team, org, assigned, usage] = await Promise.all([
    loadTeam(orgId),
    prisma.organization.findUnique({ where: { id: orgId }, select: { aiCreditsUsed: true, plan: true } }),
    prisma.auditLog.findMany({
      where: { orgId, action: "ai.task_assigned" },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.usageEvent.aggregate({ where: { orgId, createdAt: { gte: monthStart } }, _sum: { credits: true }, _count: true }),
  ]);
  const reviews = assigned.length
    ? await prisma.auditLog.findMany({
        where: { orgId, entity: "AiTask", entityId: { in: assigned.map((a) => a.id) } },
        select: { entityId: true, action: true, createdAt: true },
      })
    : [];
  const reviewOf = new Map(reviews.map((r) => [r.entityId, r]));

  const pending = assigned.filter((a) => !reviewOf.has(a.id));
  const reviewed = assigned.filter((a) => reviewOf.has(a.id));
  const plan = planOf(org?.plan);
  const used = org?.aiCreditsUsed ?? 0;
  const pct = plan.aiCreditsPerMonth ? Math.round((used / plan.aiCreditsPerMonth) * 100) : 0;
  const onDuty = team.filter((m) => m.enabled).length;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="AI team"
        subtitle="Your AI teammates take on the busywork. Nothing they produce is used until you approve it."
        actions={
          canWrite ? (
            <ModalButton label="Add a teammate" icon="plus" title="Add a teammate" description="Describe the role once. You can assign tasks and teach skills right after." size="md">
              <ActionForm action={createCustomEmployee} submitLabel="Add teammate">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block">
                    <FieldLabel>Name</FieldLabel>
                    <Input name="name" required maxLength={60} placeholder="Nova" />
                  </label>
                  <label className="block">
                    <FieldLabel>Role title</FieldLabel>
                    <Input name="roleTitle" required maxLength={80} placeholder="Research analyst" />
                  </label>
                </div>
                <label className="block">
                  <FieldLabel hint="Shown on the card">One-line summary</FieldLabel>
                  <Input name="summary" required maxLength={240} placeholder="Digs into a topic and returns a short brief." />
                </label>
                <label className="block">
                  <FieldLabel hint="Optional">Instructions</FieldLabel>
                  <Textarea name="instructions" maxLength={4000} placeholder="How should this teammate work? What should it always check first?" />
                </label>
              </ActionForm>
            </ModalButton>
          ) : null
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:col-span-2">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">AI credits this cycle</span>
            <span className="text-sm font-semibold">
              {used.toLocaleString("en-IN")} <span className="font-normal text-muted">of {plan.aiCreditsPerMonth.toLocaleString("en-IN")}</span>
            </span>
          </div>
          <ProgressBar value={used} max={plan.aiCreditsPerMonth} tone={pct >= 90 ? "danger" : pct >= 70 ? "warn" : "brand"} />
          <p className="mt-2 text-xs text-muted">
            {plan.name} plan · {usage._count} AI action{usage._count === 1 ? "" : "s"} logged since the 1st ({usage._sum.credits ?? 0} credits).
          </p>
        </div>
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">On duty</span>
          <p className="mt-1 text-2xl font-semibold tracking-tight">
            {onDuty} <span className="text-sm font-normal text-muted">of {team.length}</span>
          </p>
          <p className="mt-1 text-xs text-muted">{pending.length} waiting for your approval</p>
        </div>
      </div>

      <TeamBoard
        members={team.map((m) => ({
          key: m.key,
          name: m.name,
          role: m.role,
          summary: m.summary,
          instructions: m.instructions,
          custom: m.custom,
          enabled: m.enabled,
          creditPrice: m.creditPrice,
          tint: m.tint,
        }))}
        suggestions={AI_TASK_SUGGESTIONS}
        canManage={canWrite}
        canAssign={canAssign}
        actions={{ toggle: toggleAiEmployee, assign: assignAiTask, update: updateAiEmployee, remove: deleteCustomEmployee }}
      />

      <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title={<>Approval inbox {pending.length ? <Badge tone="warn">{pending.length}</Badge> : null}</>}>
          {pending.length === 0 ? (
            <EmptyPanel icon="check" title="Nothing awaiting approval." hint="Assign a task above and the draft will appear here for you to approve or dismiss." />
          ) : (
            <ul className="space-y-4">
              {pending.map((a) => {
                const m = parseMeta(a.metaJson);
                return (
                  <li key={a.id} className="rounded-[var(--radius-control)] border border-border bg-surface-2/50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium">
                        {m.employeeName ?? "AI teammate"} <span className="font-normal text-muted">· {m.role}</span>
                      </span>
                      <span className="text-xs text-muted">{relTime(a.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted">{m.task}</p>
                    <details className="mt-3 text-sm">
                      <summary className="cursor-pointer text-xs font-medium text-brand">Read the draft</summary>
                      <pre className="mt-2 whitespace-pre-wrap rounded-[var(--radius-control)] bg-surface p-3 font-sans text-sm leading-relaxed">{m.draft}</pre>
                    </details>
                    {canAssign ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <ActionButton action={reviewAiTask} fields={{ id: a.id, decision: "approved" }} label="Approve" icon="check" variant="primary" />
                        <ActionButton action={reviewAiTask} fields={{ id: a.id, decision: "dismissed" }} label="Dismiss" variant="ghost" />
                        {m.draft ? <CopyButton text={m.draft} label="Copy draft" /> : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Activity">
          {reviewed.length === 0 ? (
            <EmptyPanel icon="clock" title="No reviewed work yet." hint="Approved and dismissed tasks are kept here so you can find them again." />
          ) : (
            <ul className="divide-y divide-border">
              {reviewed.slice(0, 12).map((a) => {
                const m = parseMeta(a.metaJson);
                const r = reviewOf.get(a.id);
                const approved = r?.action === "ai.task_approved";
                return (
                  <li key={a.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium">{m.employeeName ?? "AI teammate"}</span>
                      <span className="flex items-center gap-2">
                        <Badge tone={approved ? "success" : "neutral"}>{approved ? "Approved" : "Dismissed"}</Badge>
                        <span className="text-xs text-muted">{relTime(r?.createdAt ?? a.createdAt)}</span>
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted">{m.task}</p>
                    {approved && m.draft ? (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs font-medium text-brand">Show draft</summary>
                        <pre className="mt-2 whitespace-pre-wrap rounded-[var(--radius-control)] bg-surface-2 p-3 font-sans text-sm leading-relaxed">{m.draft}</pre>
                        <div className="mt-2">
                          <CopyButton text={m.draft} label="Copy draft" />
                        </div>
                      </details>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted">
            <Pill>Drafts are outlines built from your own workspace data</Pill>
          </p>
        </Panel>
      </div>
    </div>
  );
}
