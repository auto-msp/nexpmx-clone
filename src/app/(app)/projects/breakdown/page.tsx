import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { orgMembers, pageContext } from "@/lib/page";
import { fmtDate, sp } from "@/lib/format";
import { cx } from "@/components/ui";
import { EmptyPanel, PageHeader, Panel, ProgressBar } from "@/components/kit";
import { ActionForm, ModalButton, ParamSelect } from "@/components/kit-client";
import { Field, Input } from "@/components/ui";
import { Icon } from "@/components/kit-icons";
import { createTask } from "@/app/actions/projects";
import { createMilestone, moveTask } from "@/app/actions/project-work";
import { TaskFields } from "@/components/projects/task-fields";
import { TaskQuickMove } from "@/components/projects/task-quick-move";
import { PRIORITY_TONE, TASK_STATUSES, TASK_STATUS_DOT, TASK_STATUS_LABEL, type TaskStatusKey } from "@/components/projects/constants";

export const metadata: Metadata = { title: "Task breakdown", robots: { index: false } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

interface Row {
  id: string | null;
  name: string;
  hint?: string;
  dueDate?: Date | null;
  completed?: boolean;
}

export default async function TaskBreakdownPage({ searchParams }: { searchParams: SearchParams }) {
  const { orgId, canWrite } = await pageContext("task:write");
  const params = await searchParams;
  const projectParam = sp(params.project);
  const assigneeParam = sp(params.assignee);

  const [projectList, members] = await Promise.all([
    prisma.project.findMany({ where: { orgId }, orderBy: { updatedAt: "desc" }, select: { id: true, name: true, status: true, client: { select: { name: true } } }, take: 300 }),
    orgMembers(orgId),
  ]);
  const selected = projectList.find((p) => p.id === projectParam) ?? null;
  const single = Boolean(selected);
  const shown = selected ? [selected] : projectList.slice(0, 12);
  const shownIds = shown.map((p) => p.id);
  const assignee = members.find((m) => m.id === assigneeParam)?.id ?? null;

  const [tasks, milestones] = shownIds.length
    ? await Promise.all([
        prisma.task.findMany({
          where: { orgId, projectId: { in: shownIds }, ...(assignee ? { assigneeId: assignee } : {}) },
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          take: 1500,
        }),
        prisma.milestone.findMany({ where: { orgId, projectId: { in: shownIds } }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] }),
      ])
    : [[], []];

  const memberOpts = members.map((m) => ({ id: m.id, name: m.name, email: m.email }));
  const hasMatrix = (pid: string) => tasks.some((t) => t.projectId === pid) || milestones.some((m) => m.projectId === pid);
  const visible = single ? shown : shown.filter((p) => hasMatrix(p.id));

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        back={{ href: "/projects", label: "All projects" }}
        title="Task breakdown"
        subtitle="Milestones run down the side and task status across the top, so you can see where every piece of work stands."
      />

      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-border bg-surface p-3">
        <ParamSelect param="project" allLabel="All projects" options={projectList.map((p) => ({ value: p.id, label: p.name }))} />
        <ParamSelect param="assignee" allLabel="Any assignee" options={members.map((m) => ({ value: m.id, label: m.name ?? m.email ?? "Member" }))} />
        <span className="text-xs text-muted">
          {milestones.length} milestone{milestones.length === 1 ? "" : "s"} · {tasks.length} task{tasks.length === 1 ? "" : "s"}
        </span>
        {single && canWrite && selected ? (
          <div className="ml-auto flex flex-wrap gap-2">
            <ModalButton label="Add milestone" icon="flag" variant="secondary" title="Add milestone">
              <ActionForm action={createMilestone} submitLabel="Add milestone" pendingLabel="Adding…">
                <input type="hidden" name="projectId" value={selected.id} />
                <Field label="Name *">
                  <Input name="name" required maxLength={160} placeholder="Design sign-off" autoComplete="off" />
                </Field>
                <Field label="Due date">
                  <Input name="dueDate" type="date" />
                </Field>
              </ActionForm>
            </ModalButton>
            <ModalButton label="Add task" icon="plus" title="Add task">
              <ActionForm action={createTask} submitLabel="Add task" pendingLabel="Adding…">
                <TaskFields
                  projectId={selected.id}
                  members={memberOpts}
                  milestones={milestones.filter((m) => m.projectId === selected.id).map((m) => ({ id: m.id, name: m.name }))}
                />
              </ActionForm>
            </ModalButton>
          </div>
        ) : null}
      </div>

      {projectList.length === 0 ? (
        <EmptyPanel icon="folder" title="No projects yet" hint="Create a project first, then break it into milestones and tasks." action={<Link href="/projects" className="text-sm text-brand hover:underline">Go to projects</Link>} />
      ) : visible.length === 0 ? (
        <EmptyPanel icon="tasks" title="Nothing to break down yet" hint="None of your projects has tasks or milestones. Open a project and add some." />
      ) : (
        <div className="space-y-6">
          {visible.map((p) => {
            const pTasks = tasks.filter((t) => t.projectId === p.id);
            const pMilestones = milestones.filter((m) => m.projectId === p.id);
            const rows: Row[] = [
              ...pMilestones.map((m) => ({ id: m.id, name: m.name, dueDate: m.dueDate, completed: Boolean(m.completedAt) })),
              { id: null, name: "Unassigned to milestone", hint: "Tasks not in any milestone" },
            ];
            const milestoneOpts = pMilestones.map((m) => ({ id: m.id, name: m.name }));
            const colTotals = Object.fromEntries(TASK_STATUSES.map((s) => [s, pTasks.filter((t) => t.status === s).length])) as Record<TaskStatusKey, number>;
            const done = colTotals.DONE;
            return (
              <Panel
                key={p.id}
                flush
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    <Link href={`/projects/${p.id}`} className="hover:text-brand">{p.name}</Link>
                    {p.client ? <span className="text-xs font-normal text-muted">{p.client.name}</span> : null}
                  </span>
                }
                action={
                  <span className="flex items-center gap-3 text-xs text-muted">
                    {done}/{pTasks.length} done
                    <Link href={`/projects/${p.id}?tab=tasks`} className="text-brand hover:underline">Open tasks</Link>
                  </span>
                }
              >
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[960px] table-fixed text-left text-sm">
                    <thead>
                      <tr className="border-b border-border bg-surface-2/60 text-[10px] uppercase tracking-[0.14em] text-muted">
                        <th className="w-52 px-4 py-3 font-mono font-semibold">Milestone</th>
                        {TASK_STATUSES.map((s) => (
                          <th key={s} className="px-3 py-3 font-mono font-semibold">
                            <span className="flex items-center gap-1.5">
                              <span className={cx("h-2 w-2 rounded-full", TASK_STATUS_DOT[s])} />
                              {TASK_STATUS_LABEL[s]}
                            </span>
                          </th>
                        ))}
                        <th className="w-36 px-4 py-3 font-mono font-semibold">Completion</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {rows.map((r) => {
                        const rowTasks = pTasks.filter((t) => (t.milestoneId ?? null) === r.id);
                        const rowDone = rowTasks.filter((t) => t.status === "DONE").length;
                        const rowPct = rowTasks.length ? Math.round((rowDone / rowTasks.length) * 100) : 0;
                        return (
                          <tr key={r.id ?? "none"} className="align-top">
                            <td className="px-4 py-3">
                              <div className="flex items-start gap-2">
                                <Icon name={r.id ? "flag" : "folder"} className={cx("mt-0.5 h-4 w-4 shrink-0", r.completed ? "text-success" : "text-muted")} />
                                <div className="min-w-0">
                                  <div className="break-words font-medium">{r.name}</div>
                                  <div className="text-xs text-muted">{r.hint ?? (r.dueDate ? `Due ${fmtDate(r.dueDate)}` : "No due date")}</div>
                                  <div className="mt-1 text-[11px] text-muted">{rowTasks.length} task{rowTasks.length === 1 ? "" : "s"}</div>
                                </div>
                              </div>
                            </td>
                            {TASK_STATUSES.map((s) => {
                              const cell = rowTasks.filter((t) => t.status === s);
                              return (
                                <td key={s} className="px-2 py-2">
                                  {cell.length === 0 ? (
                                    <div className="rounded-[var(--radius-control)] border border-dashed border-border px-2 py-3 text-center text-[11px] text-muted/70">0</div>
                                  ) : (
                                    <div className="space-y-1.5">
                                      {cell.map((t) => (
                                        <div key={t.id} className="rounded-[var(--radius-control)] border border-border bg-surface-2/60 p-2">
                                          <div className="flex items-start gap-1.5">
                                            <span className={cx("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", PRIORITY_TONE[t.priority] ?? "bg-muted")} title={`${t.priority.toLowerCase()} priority`} />
                                            <Link
                                              href={`/projects/${p.id}?tab=tasks`}
                                              className={cx("min-w-0 break-words text-xs font-medium hover:text-brand", t.status === "DONE" && "text-muted line-through")}
                                            >
                                              {t.title}
                                            </Link>
                                          </div>
                                          {single && canWrite ? (
                                            <TaskQuickMove taskId={t.id} status={t.status} milestoneId={t.milestoneId} milestones={milestoneOpts} action={moveTask} />
                                          ) : null}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                            <td className="px-4 py-3">
                              <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
                                <span>{rowDone}/{rowTasks.length}</span>
                                <span>{rowPct}%</span>
                              </div>
                              <ProgressBar value={rowDone} max={rowTasks.length || 1} tone="success" />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-border bg-surface-2/40 text-xs text-muted">
                        <td className="px-4 py-2.5 font-medium">Total</td>
                        {TASK_STATUSES.map((s) => (
                          <td key={s} className="px-3 py-2.5 font-medium text-text">{colTotals[s]}</td>
                        ))}
                        <td className="px-4 py-2.5 font-medium text-text">{pTasks.length ? Math.round((done / pTasks.length) * 100) : 0}% done</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Panel>
            );
          })}
          {!single && projectList.length > 12 ? (
            <p className="text-center text-xs text-muted">Showing the 12 most recently updated projects. Pick a project above to see any other.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
