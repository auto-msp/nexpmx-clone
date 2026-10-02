import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { orgMembers, pageContext } from "@/lib/page";
import { fmtDate, sp } from "@/lib/format";
import { Badge, Field, Input, Select, Textarea } from "@/components/ui";
import { Avatar, EmptyPanel, FormGrid, PageHeader, Panel, StatusBadge, TabLinks } from "@/components/kit";
import { ActionButton, ActionForm, ModalButton, ParamSelect, SearchInput } from "@/components/kit-client";
import { StatusSelect } from "@/components/home/task-controls";
import { createTask, deleteTask, updateTaskStatus } from "@/app/actions/tasks";
import { DUE_BUCKET_LABEL, dueBucket, todayKey, type DueBucket } from "@/components/home/dates";
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  isTaskPriority,
  isTaskStatus,
} from "@/components/home/task-meta";

export const metadata: Metadata = { title: "Tasks", robots: { index: false } };

type Tab = "mine" | "personal" | "all";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "mine", label: "Assigned to me" },
  { id: "personal", label: "Personal" },
  { id: "all", label: "Everything" },
];

const GRID =
  "lg:grid lg:grid-cols-[2.25rem_minmax(0,1fr)_9rem_5.5rem_9rem_6.5rem_7.5rem_2.25rem] lg:items-center";

export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { orgId, userId, canWrite } = await pageContext("task:write");
  const q = await searchParams;
  const tab: Tab = (["mine", "personal", "all"] as const).find((t) => t === sp(q.tab)) ?? "mine";
  const statusParam = sp(q.status);
  const priorityParam = sp(q.priority);
  const projectParam = sp(q.project);
  const search = sp(q.q).slice(0, 80);
  const group = sp(q.group) === "status" ? "status" : "due";
  const today = todayKey();

  const visible: Prisma.TaskWhereInput = {
    OR: [{ projectId: { not: null } }, { createdById: userId }, { assigneeId: userId }],
  };
  const tabWhere = (t: Tab): Prisma.TaskWhereInput =>
    t === "mine"
      ? { assigneeId: userId }
      : t === "personal"
        ? { projectId: null, OR: [{ createdById: userId }, { assigneeId: userId }] }
        : visible;

  const and: Prisma.TaskWhereInput[] = [{ orgId }, visible, tabWhere(tab)];
  if (statusParam === "ALL") {
    // everything, including done
  } else if (isTaskStatus(statusParam)) and.push({ status: statusParam });
  else and.push({ status: { not: "DONE" } });
  if (isTaskPriority(priorityParam)) and.push({ priority: priorityParam });
  if (projectParam === "none") and.push({ projectId: null });
  else if (projectParam) and.push({ projectId: projectParam });
  if (search) {
    and.push({ OR: [{ title: { contains: search, mode: "insensitive" } }, { description: { contains: search, mode: "insensitive" } }] });
  }

  const [tasks, projects, members, cMine, cPersonal, cAll] = await Promise.all([
    prisma.task.findMany({
      where: { AND: and },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      take: 300,
      include: { project: { select: { id: true, name: true } } },
    }),
    prisma.project.findMany({ where: { orgId, status: { not: "COMPLETED" } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    orgMembers(orgId),
    prisma.task.count({ where: { AND: [{ orgId }, visible, tabWhere("mine"), { status: { not: "DONE" } }] } }),
    prisma.task.count({ where: { AND: [{ orgId }, visible, tabWhere("personal"), { status: { not: "DONE" } }] } }),
    prisma.task.count({ where: { AND: [{ orgId }, visible, { status: { not: "DONE" } }] } }),
  ]);

  const memberById = new Map(members.map((m) => [m.id, m]));
  const counts: Record<Tab, number> = { mine: cMine, personal: cPersonal, all: cAll };
  const keep = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ status: statusParam, priority: priorityParam, project: projectParam, q: search, group: group === "status" ? "status" : "", ...extra })) {
      if (v) p.set(k, v);
    }
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  type Row = (typeof tasks)[number];
  const overdueCount = tasks.filter((t) => t.status !== "DONE" && dueBucket(t.dueDate, today) === "overdue").length;

  type Group = { key: string; label: string; tone?: "danger" | "warn"; rows: Row[] };
  const groups: Group[] = [];
  if (group === "status") {
    for (const s of TASK_STATUSES) {
      const rows = tasks.filter((t) => t.status === s);
      if (rows.length) groups.push({ key: s, label: TASK_STATUS_LABEL[s], rows });
    }
  } else {
    const order: DueBucket[] = ["overdue", "today", "week", "later", "none"];
    for (const b of order) {
      const rows = tasks.filter((t) => t.status !== "DONE" && dueBucket(t.dueDate, today) === b);
      if (rows.length) groups.push({ key: b, label: DUE_BUCKET_LABEL[b], tone: b === "overdue" ? "danger" : b === "today" ? "warn" : undefined, rows });
    }
    const done = tasks.filter((t) => t.status === "DONE");
    if (done.length) groups.push({ key: "done", label: "Done", rows: done });
  }

  const taskForm = (
    <ActionForm action={createTask} submitLabel="Create task">
      <Field label="Title">
        <Input name="title" required maxLength={200} placeholder="What needs doing?" autoFocus />
      </Field>
      <Field label="Description (optional)">
        <Textarea name="description" maxLength={4000} placeholder="Context, links, acceptance criteria…" />
      </Field>
      <FormGrid>
        <Field label="Project (optional)">
          <Select name="projectId" defaultValue={projectParam && projectParam !== "none" ? projectParam : ""}>
            <option value="">No project — personal task</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Assignee">
          <Select name="assigneeId" defaultValue={userId}>
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name ?? m.email}
                {m.id === userId ? " (me)" : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Priority">
          <Select name="priority" defaultValue="MEDIUM">
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {TASK_PRIORITY_LABEL[p]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Due date (optional)">
          <Input name="dueDate" type="date" />
        </Field>
      </FormGrid>
      <p className="text-xs text-muted">Tasks without a project are personal and always assigned to you.</p>
    </ActionForm>
  );

  const filtersActive = Boolean(statusParam || priorityParam || projectParam || search);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Tasks"
        subtitle="Everything on your plate in one list — project work and personal to-dos."
        actions={
          canWrite ? (
            <ModalButton label="New task" icon="plus" title="New task" description="Add work to a project, or keep it as a personal to-do.">
              {taskForm}
            </ModalButton>
          ) : null
        }
      />

      <TabLinks tabs={TABS.map((t) => ({ href: `/tasks${keep({ tab: t.id === "mine" ? "" : t.id })}`, label: t.label, active: tab === t.id, count: counts[t.id] }))} />

      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchInput param="q" placeholder="Search tasks…" className="sm:w-64" />
        <ParamSelect
          param="status"
          allLabel="Open tasks"
          options={[{ value: "ALL", label: "All, including done" }, ...TASK_STATUSES.map((s) => ({ value: s, label: TASK_STATUS_LABEL[s] }))]}
        />
        <ParamSelect param="priority" allLabel="Any priority" options={TASK_PRIORITIES.map((p) => ({ value: p, label: TASK_PRIORITY_LABEL[p] }))} />
        <ParamSelect
          param="project"
          allLabel="Any project"
          options={[{ value: "none", label: "Personal (no project)" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
        />
        <ParamSelect param="group" allLabel="Group by due date" options={[{ value: "status", label: "Group by status" }]} />
        {filtersActive ? (
          <Link href={`/tasks${tab === "mine" ? "" : `?tab=${tab}`}`} className="text-xs text-brand hover:underline">
            Clear filters
          </Link>
        ) : null}
      </div>

      {tasks.length === 0 ? (
        <EmptyPanel
          icon="tasks"
          title={filtersActive ? "No tasks match these filters" : tab === "personal" ? "No personal tasks" : tab === "mine" ? "Nothing assigned to you" : "No tasks yet"}
          hint={filtersActive ? "Try clearing a filter or searching for something else." : "Add a task to start tracking work. Project tasks also show up on the project."}
          action={
            canWrite && !filtersActive ? (
              <ModalButton label="New task" icon="plus" title="New task">
                {taskForm}
              </ModalButton>
            ) : undefined
          }
        />
      ) : (
        <>
          <p className="mb-3 text-xs text-muted">
            {tasks.length === 300 ? "Showing the first 300 tasks" : `${tasks.length} task${tasks.length === 1 ? "" : "s"}`}
            {overdueCount > 0 ? <span className="text-danger"> · {overdueCount} overdue</span> : null}
          </p>
          <div className="space-y-5">
            {groups.map((g) => (
              <Panel
                key={g.key}
                flush
                title={
                  <span className={g.tone === "danger" ? "text-danger" : g.tone === "warn" ? "text-warn" : undefined}>
                    {g.label} <span className="ml-1 font-normal text-muted">{g.rows.length}</span>
                  </span>
                }
              >
                <div className={`hidden border-b border-border px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted ${GRID}`}>
                  <span />
                  <span>Task</span>
                  <span>Project</span>
                  <span>Priority</span>
                  <span>Assignee</span>
                  <span>Due</span>
                  <span>Status</span>
                  <span />
                </div>
                <ul className="divide-y divide-border">
                  {g.rows.map((t) => {
                    const assignee = t.assigneeId ? memberById.get(t.assigneeId) : null;
                    const done = t.status === "DONE";
                    const bucket = dueBucket(t.dueDate, today);
                    const dueTone = done ? "text-muted" : bucket === "overdue" ? "text-danger" : bucket === "today" ? "text-warn" : "text-muted";
                    return (
                      <li key={t.id} className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 ${GRID}`}>
                        <span className="order-1">
                          {canWrite ? (
                            <ActionButton
                              action={updateTaskStatus}
                              fields={{ id: t.id, status: done ? "TODO" : "DONE" }}
                              label={done ? "Reopen task" : "Mark done"}
                              icon="check"
                              variant={done ? "secondary" : "ghost"}
                              onlyIcon
                              className={done ? "text-success" : undefined}
                            />
                          ) : null}
                        </span>
                        <div className="order-2 min-w-0 flex-1 basis-[55%] lg:basis-auto">
                          <p className={`truncate text-sm font-medium ${done ? "text-muted line-through" : ""}`}>{t.title}</p>
                          {t.description ? <p className="truncate text-xs text-muted">{t.description}</p> : null}
                        </div>
                        <span className="order-4 min-w-0 truncate text-xs lg:order-3">
                          {t.project ? (
                            <Link href={`/projects/${t.project.id}`} className="text-brand hover:underline">
                              {t.project.name}
                            </Link>
                          ) : (
                            <span className="text-muted">Personal</span>
                          )}
                        </span>
                        <span className="order-5 lg:order-4">
                          <Badge tone={t.priority === "URGENT" ? "danger" : t.priority === "HIGH" ? "warn" : t.priority === "MEDIUM" ? "brand" : "neutral"}>
                            {TASK_PRIORITY_LABEL[t.priority as keyof typeof TASK_PRIORITY_LABEL] ?? t.priority}
                          </Badge>
                        </span>
                        <span className="order-6 flex min-w-0 items-center gap-2 text-xs lg:order-5">
                          {assignee ? (
                            <>
                              <Avatar name={assignee.name ?? assignee.email} size="sm" src={assignee.image} />
                              <span className="truncate">{assignee.name ?? assignee.email}</span>
                            </>
                          ) : (
                            <span className="text-muted">Unassigned</span>
                          )}
                        </span>
                        <span className={`order-7 text-xs lg:order-6 ${dueTone}`}>
                          {t.dueDate ? fmtDate(t.dueDate) : "No date"}
                          {!done && bucket === "overdue" && t.dueDate ? <span className="ml-1">· overdue</span> : null}
                        </span>
                        <span className="order-8 lg:order-7">
                          {canWrite ? <StatusSelect id={t.id} status={t.status} action={updateTaskStatus} /> : <StatusBadge status={t.status} />}
                        </span>
                        <span className="order-3 ml-auto lg:order-8 lg:ml-0">
                          {canWrite ? (
                            <ActionButton
                              action={deleteTask}
                              fields={{ id: t.id }}
                              label="Delete task"
                              icon="trash"
                              onlyIcon
                              confirm={`Delete "${t.title}"? This cannot be undone.`}
                            />
                          ) : null}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </Panel>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
