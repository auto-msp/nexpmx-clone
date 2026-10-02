import Link from "next/link";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { fmtDate, fmtDateTime, relTime } from "@/lib/format";
import { Avatar, DetailRow, EmptyPanel, KpiGrid, KpiTile, PageHeader, Panel, ProgressBar, StatusBadge, TabLinks } from "@/components/kit";
import { ActionButton, ActionForm, ModalButton } from "@/components/kit-client";
import { Badge, Field, Select } from "@/components/ui";
import { changeMemberRole, removeMember } from "@/app/actions/team";

export const ROLE_TONE: Record<string, "brand" | "warn" | "success" | "neutral"> = {
  OWNER: "brand",
  ADMIN: "warn",
  MANAGER: "success",
  MEMBER: "neutral",
};

type Member = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  designation: string | null;
  phone: string | null;
  weeklyCapacityHours: number;
  role: string;
  joinedAt: Date;
};

const TASK_STATUSES = ["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"] as const;
const TABS = [
  { id: "overview", label: "Overview" },
  { id: "workload", label: "Workload" },
  { id: "projects", label: "Projects" },
  { id: "activity", label: "Activity" },
] as const;

export async function MemberDetail({
  orgId,
  viewerId,
  viewerRole,
  member,
  tab,
}: {
  orgId: string;
  viewerId: string;
  viewerRole: string;
  member: Member;
  tab: string;
}) {
  const active = TABS.some((t) => t.id === tab) ? tab : "overview";
  const isSelf = member.id === viewerId;
  const canInvite = can(viewerRole, "org:invite");
  const viewerIsOwner = viewerRole === "OWNER";
  const privilegedTarget = member.role === "OWNER" || member.role === "ADMIN";
  const canManage = canInvite && !isSelf && (viewerIsOwner || !privilegedTarget);
  const canSeeActivity = isSelf || canInvite;

  const [tasks, auditRows] = await Promise.all([
    prisma.task.findMany({
      where: { orgId, assigneeId: member.id },
      select: { id: true, title: true, status: true, dueDate: true, priority: true, projectId: true },
      orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
      take: 500,
    }),
    active === "activity" && canSeeActivity
      ? prisma.auditLog.findMany({ where: { orgId, actorId: member.id }, orderBy: { createdAt: "desc" }, take: 30 })
      : Promise.resolve([]),
  ]);

  const byStatus = new Map<string, number>();
  for (const t of tasks) byStatus.set(t.status, (byStatus.get(t.status) ?? 0) + 1);
  const open = tasks.filter((t) => t.status !== "DONE");
  const now = Date.now();
  const overdue = open.filter((t) => t.dueDate && t.dueDate.getTime() < now).length;
  const dueSoon = open.filter((t) => t.dueDate && t.dueDate.getTime() >= now && t.dueDate.getTime() < now + 7 * 86_400_000).length;

  const projectIds = [...new Set(tasks.map((t) => t.projectId).filter((x): x is string => Boolean(x)))];
  const projects = projectIds.length
    ? await prisma.project.findMany({ where: { orgId, id: { in: projectIds } }, select: { id: true, name: true, status: true, deadline: true, client: { select: { name: true } } }, orderBy: { name: "asc" } })
    : [];
  const projectName = new Map(projects.map((p) => [p.id, p.name]));

  const base = `/settings/team?member=${member.id}`;

  const roleOptions = viewerIsOwner ? ["OWNER", "ADMIN", "MANAGER", "MEMBER"] : ["MANAGER", "MEMBER"];

  return (
    <>
      <PageHeader
        back={{ href: "/settings/team", label: "Team directory" }}
        title={
          <span className="inline-flex items-center gap-3">
            <Avatar name={member.name ?? member.email} size="lg" src={member.image} />
            <span className="truncate">{member.name ?? member.email}</span>
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {member.designation ? <span>{member.designation}</span> : null}
            <Badge tone={ROLE_TONE[member.role] ?? "neutral"}>{member.role.toLowerCase()}</Badge>
            {isSelf ? <Badge tone="neutral">you</Badge> : null}
          </span>
        }
        actions={
          canManage ? (
            <>
              <ModalButton label="Change role" title="Change role" icon="edit" variant="secondary" size="sm" description={`Update what ${member.name ?? "this member"} can do in the workspace.`}>
                <ActionForm action={changeMemberRole} submitLabel="Save role" resetOnSuccess={false}>
                  <input type="hidden" name="userId" value={member.id} />
                  <Field label="Role">
                    <Select name="role" defaultValue={member.role}>
                      {roleOptions.map((r) => (
                        <option key={r} value={r}>
                          {r.charAt(0) + r.slice(1).toLowerCase()}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <p className="text-xs text-muted">Owners manage everything. Admins invite people and run the AI. Managers handle clients and money. Members do the work.</p>
                </ActionForm>
              </ModalButton>
              <ActionButton
                action={removeMember}
                fields={{ userId: member.id }}
                label="Remove from workspace"
                icon="trash"
                variant="danger"
                className="px-3 py-2 text-sm"
                confirm={`Remove ${member.name ?? member.email}? They lose access immediately and their open tasks become unassigned.`}
              />
            </>
          ) : null
        }
      />

      <TabLinks tabs={TABS.map((t) => ({ href: t.id === "overview" ? base : `${base}&tab=${t.id}`, label: t.label, active: active === t.id, count: t.id === "workload" ? open.length : t.id === "projects" ? projects.length : undefined }))} />

      {active === "overview" ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Panel title="Details">
            <div className="divide-y divide-border">
              <DetailRow label="Email">
                <a href={`mailto:${member.email}`} className="text-brand hover:underline">
                  {member.email}
                </a>
              </DetailRow>
              <DetailRow label="Phone">{member.phone ? <a href={`tel:${member.phone}`} className="text-brand hover:underline">{member.phone}</a> : "Not set"}</DetailRow>
              <DetailRow label="Designation">{member.designation || "Not set"}</DetailRow>
              <DetailRow label="Role">{member.role.toLowerCase()}</DetailRow>
              <DetailRow label="Weekly capacity">{member.weeklyCapacityHours} hours</DetailRow>
              <DetailRow label="Joined">{fmtDate(member.joinedAt)}</DetailRow>
            </div>
          </Panel>
          <div className="space-y-4">
            <KpiGrid cols={2}>
              <KpiTile label="Open tasks" value={open.length} icon="tasks" tone={overdue > 0 ? "warn" : "neutral"} hint={overdue > 0 ? `${overdue} overdue` : "None overdue"} />
              <KpiTile label="Completed" value={byStatus.get("DONE") ?? 0} icon="check" tone="success" />
              <KpiTile label="Projects" value={projects.length} icon="folder" />
              <KpiTile label="Due this week" value={dueSoon} icon="calendar" tone="brand" />
            </KpiGrid>
          </div>
        </div>
      ) : null}

      {active === "workload" ? (
        <div className="space-y-6">
          <Panel title="Tasks by status">
            {tasks.length === 0 ? (
              <EmptyPanel icon="tasks" title="Nothing assigned" hint="Tasks assigned to this person will show up here." />
            ) : (
              <ul className="space-y-3">
                {TASK_STATUSES.map((s) => {
                  const n = byStatus.get(s) ?? 0;
                  return (
                    <li key={s} className="grid grid-cols-[110px_1fr_32px] items-center gap-3 text-sm">
                      <StatusBadge status={s} />
                      <ProgressBar value={n} max={Math.max(1, tasks.length)} tone={s === "DONE" ? "success" : "brand"} />
                      <span className="text-right tabular-nums text-muted">{n}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Capacity">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Weekly capacity</p>
                <p className="mt-1 text-2xl font-semibold">{member.weeklyCapacityHours}h</p>
              </div>
              <div>
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Open tasks</p>
                <p className="mt-1 text-2xl font-semibold">{open.length}</p>
              </div>
              <div>
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Hours per open task</p>
                <p className="mt-1 text-2xl font-semibold">{open.length > 0 ? `${(member.weeklyCapacityHours / open.length).toFixed(1)}h` : "n/a"}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted">Tasks do not carry time estimates yet, so this shows how thin a week of capacity is spread across open work.</p>
          </Panel>

          {open.length > 0 ? (
            <Panel title="Open tasks" flush>
              <ul className="divide-y divide-border">
                {open.slice(0, 15).map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{t.title}</span>
                      <span className="block truncate text-xs text-muted">{t.projectId ? projectName.get(t.projectId) ?? "Project" : "No project"}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <StatusBadge status={t.status} />
                      {t.dueDate ? <span className={t.dueDate.getTime() < now ? "text-xs text-danger" : "text-xs text-muted"}>{fmtDate(t.dueDate)}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
              {open.length > 15 ? <p className="border-t border-border px-5 py-2 text-xs text-muted">Showing 15 of {open.length}. See all in Tasks.</p> : null}
            </Panel>
          ) : null}
        </div>
      ) : null}

      {active === "projects" ? (
        projects.length === 0 ? (
          <EmptyPanel icon="folder" title="Not on any project yet" hint="Projects appear here once this person has tasks in them." />
        ) : (
          <Panel flush>
            <ul className="divide-y divide-border">
              {projects.map((p) => {
                const mine = tasks.filter((t) => t.projectId === p.id);
                const done = mine.filter((t) => t.status === "DONE").length;
                return (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <span className="min-w-0">
                      <Link href={`/projects/${p.id}`} className="block truncate text-sm font-medium hover:text-brand">
                        {p.name}
                      </Link>
                      <span className="block truncate text-xs text-muted">
                        {p.client?.name ?? "No client"}
                        {p.deadline ? ` · due ${fmtDate(p.deadline)}` : ""}
                      </span>
                    </span>
                    <span className="flex items-center gap-3 text-xs text-muted">
                      <span>
                        {done}/{mine.length} tasks done
                      </span>
                      <StatusBadge status={p.status} />
                    </span>
                  </li>
                );
              })}
            </ul>
          </Panel>
        )
      ) : null}

      {active === "activity" ? (
        !canSeeActivity ? (
          <EmptyPanel icon="eye" title="Activity is private" hint="Owners and admins can see what a teammate has changed." />
        ) : auditRows.length === 0 ? (
          <EmptyPanel icon="clock" title="No activity yet" hint="Changes made by this person will be listed here." />
        ) : (
          <Panel flush title="Recent changes">
            <ul className="divide-y divide-border">
              {auditRows.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-sm">
                  <span>
                    <span className="font-mono text-xs">{l.action}</span> <span className="text-muted">on {l.entity}</span>
                  </span>
                  <time className="text-xs text-muted" dateTime={l.createdAt.toISOString()} title={fmtDateTime(l.createdAt)}>
                    {relTime(l.createdAt)}
                  </time>
                </li>
              ))}
            </ul>
          </Panel>
        )
      ) : null}
    </>
  );
}
