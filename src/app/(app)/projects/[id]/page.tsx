import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { orgMembers, pageContext } from "@/lib/page";
import { daysFromNow, dateInput, fmtDate, fmtDateTime, inr, relTime, sp } from "@/lib/format";
import { Badge, ButtonLink, Field, Input, Table, Textarea, cx } from "@/components/ui";
import {
  DetailRow,
  EmptyPanel,
  HealthBadge,
  KpiGrid,
  KpiTile,
  PageHeader,
  Panel,
  Pill,
  ProgressBar,
  StatusBadge,
  TabLinks,
} from "@/components/kit";
import { ActionButton, ActionForm, ModalButton } from "@/components/kit-client";
import { Icon } from "@/components/kit-icons";
import {
  createTask,
  deleteProject,
  setTaskStatus,
  updateProject,
  updateProjectStatus,
} from "@/app/actions/projects";
import {
  addProjectComment,
  createMilestone,
  createProjectDecision,
  deleteMilestone,
  deleteProjectExpense,
  deleteTask,
  logProjectExpense,
  toggleMilestone,
  updateMilestone,
  updateTask,
} from "@/app/actions/project-work";
import { ProjectFields } from "@/components/projects/project-fields";
import { TaskFields } from "@/components/projects/task-fields";
import { TaskCard } from "@/components/projects/task-card";
import {
  EXPENSE_CATEGORIES,
  TASK_STATUSES,
  TASK_STATUS_DOT,
  TASK_STATUS_LABEL,
  projectTypeLabel,
  type TaskStatusKey,
} from "@/components/projects/constants";
import { DEADLINE_TEXT, deadlineInfo } from "@/components/projects/deadline";
import { invoiceGrossMinor } from "@/components/projects/data";

export const metadata: Metadata = { title: "Project", robots: { index: false } };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const TABS = [
  ["overview", "Overview"],
  ["tasks", "Tasks"],
  ["milestones", "Milestones"],
  ["documents", "Documents"],
  ["expenses", "Expenses"],
  ["decisions", "Decisions"],
] as const;
type TabKey = (typeof TABS)[number][0];

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default async function ProjectDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const query = await searchParams;
  const { orgId, canWrite, role } = await pageContext("project:write");
  const canDelete = role === "OWNER" || role === "ADMIN";
  const tab: TabKey = (TABS.find(([k]) => k === sp(query.tab))?.[0] ?? "overview") as TabKey;

  const project = await prisma.project.findFirst({
    where: { id, orgId },
    include: { client: { select: { id: true, name: true, company: true, email: true, phone: true, health: true, status: true } } },
  });
  if (!project) notFound();

  const [tasks, milestones, members, clients, expenseAgg, invoices] = await Promise.all([
    prisma.task.findMany({
      where: { orgId, projectId: id },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      take: 600,
    }),
    prisma.milestone.findMany({ where: { orgId, projectId: id }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] }),
    orgMembers(orgId),
    prisma.client.findMany({ where: { orgId }, orderBy: { name: "asc" }, select: { id: true, name: true, company: true }, take: 500 }),
    prisma.expense.aggregate({ where: { orgId, projectId: id }, _sum: { amountMinor: true }, _count: { _all: true } }),
    prisma.invoice.findMany({
      where: { orgId, projectId: id, status: { not: "DRAFT" } },
      select: { amountMinor: true, gstRateBps: true, status: true },
    }),
  ]);

  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "DONE").length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const byStatus = Object.fromEntries(TASK_STATUSES.map((s) => [s, tasks.filter((t) => t.status === s).length])) as Record<TaskStatusKey, number>;
  const billed = invoices.reduce((sum, i) => sum + invoiceGrossMinor(i), 0);
  const expenses = expenseAgg._sum.amountMinor ?? 0;
  const dl = deadlineInfo(project.deadline, project.status);
  const milestoneName = new Map(milestones.map((m) => [m.id, m.name]));
  const memberOpts = members.map((m) => ({ id: m.id, name: m.name, email: m.email }));
  const milestoneOpts = milestones.map((m) => ({ id: m.id, name: m.name }));
  const base = `/projects/${id}`;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        back={{ href: "/projects", label: "All projects" }}
        title={
          <span className="flex min-w-0 flex-wrap items-center gap-3">
            <span className="truncate">{project.name}</span>
            <StatusBadge status={project.status} />
            <HealthBadge health={project.health} />
          </span>
        }
        subtitle={
          <span>
            {project.client ? (
              <Link href={`/clients/${project.client.id}`} className="text-brand hover:underline">{project.client.name}</Link>
            ) : (
              "Internal project"
            )}
            {" · "}
            {projectTypeLabel(project.projectType)}
          </span>
        }
        actions={
          <>
            <ButtonLink href={`/projects/breakdown?project=${id}`} variant="secondary">
              <Icon name="tasks" className="h-4 w-4" /> Task breakdown
            </ButtonLink>
            {canWrite ? (
              <ModalButton label="Edit" icon="edit" variant="secondary" title="Edit project" size="lg">
                <ActionForm action={updateProject} submitLabel="Save changes" resetOnSuccess={false}>
                  <ProjectFields project={project} clients={clients} />
                </ActionForm>
              </ModalButton>
            ) : null}
            {canWrite && project.status !== "COMPLETED" ? (
              <ActionButton action={updateProjectStatus} fields={{ id, status: "COMPLETED" }} label="Mark completed" icon="check" variant="secondary" className="px-4 py-2 text-sm" />
            ) : null}
            {canWrite && project.status === "COMPLETED" ? (
              <ActionButton action={updateProjectStatus} fields={{ id, status: "ACTIVE" }} label="Reopen" icon="play" variant="secondary" className="px-4 py-2 text-sm" />
            ) : null}
            {canDelete ? (
              <ActionButton
                action={deleteProject}
                fields={{ id }}
                label="Delete"
                icon="trash"
                variant="danger"
                confirm="Delete this project and all its tasks and milestones? This cannot be undone."
                className="px-4 py-2 text-sm"
              />
            ) : null}
          </>
        }
      />

      <KpiGrid>
        <KpiTile label="Progress" value={`${pct}%`} icon="chart" tone={pct === 100 && total > 0 ? "success" : "neutral"} hint={`${done} of ${total} tasks done`} />
        <KpiTile label="Open tasks" value={total - done} icon="tasks" hint={`${byStatus.IN_PROGRESS} in progress`} />
        <KpiTile label="Contract value" value={project.contractValueMinor ? inr(project.contractValueMinor) : "Not set"} icon="rupee" hint={`${inr(billed)} billed`} />
        <KpiTile label="Deadline" value={project.deadline ? fmtDate(project.deadline) : "None set"} icon="calendar" tone={dl.tone === "danger" ? "danger" : dl.tone === "warn" ? "warn" : "neutral"} hint={dl.text} />
      </KpiGrid>

      <TabLinks
        tabs={TABS.map(([k, label]) => ({
          href: `${base}?tab=${k}`,
          label,
          active: tab === k,
          count: k === "tasks" ? total : k === "milestones" ? milestones.length : k === "expenses" ? expenseAgg._count._all : undefined,
        }))}
      />

      {tab === "overview" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Panel title="Progress">
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-2xl font-semibold">{pct}%</span>
                <span className="text-xs text-muted">{done} of {total} tasks complete</span>
              </div>
              <ProgressBar value={done} max={total || 1} tone="success" />
              <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {TASK_STATUSES.map((s) => (
                  <li key={s} className="rounded-[var(--radius-control)] border border-border bg-surface-2/50 px-3 py-2">
                    <div className="flex items-center gap-1.5 text-[11px] text-muted">
                      <span className={cx("h-2 w-2 rounded-full", TASK_STATUS_DOT[s])} />
                      {TASK_STATUS_LABEL[s]}
                    </div>
                    <div className="mt-0.5 text-lg font-semibold">{byStatus[s]}</div>
                  </li>
                ))}
              </ul>
            </Panel>
            {project.description ? (
              <Panel title="About this project">
                <p className="whitespace-pre-line text-sm">{project.description}</p>
              </Panel>
            ) : null}
            <ProjectNotes orgId={orgId} projectId={id} canComment={canWrite} />
          </div>
          <div className="space-y-4">
            <Panel title="Key dates">
              <div className="divide-y divide-border">
                <DetailRow label="Start">{fmtDate(project.startDate)}</DetailRow>
                <DetailRow label="Deadline">
                  <span className={DEADLINE_TEXT[dl.tone]}>{project.deadline ? `${fmtDate(project.deadline)} · ${dl.text}` : "—"}</span>
                </DetailRow>
                <DetailRow label="Created">{fmtDate(project.createdAt)}</DetailRow>
                <DetailRow label="Last updated">{relTime(project.updatedAt)}</DetailRow>
              </div>
            </Panel>
            <Panel title="Money">
              <div className="divide-y divide-border">
                <DetailRow label="Contract value">{project.contractValueMinor ? inr(project.contractValueMinor) : "—"}</DetailRow>
                <DetailRow label="Billed (incl. GST)">{inr(billed)}</DetailRow>
                <DetailRow label="Expenses logged">{inr(expenses)}</DetailRow>
                <DetailRow label="Billed minus expenses">
                  <span className={billed - expenses < 0 ? "text-danger" : "text-success"}>{inr(billed - expenses)}</span>
                </DetailRow>
              </div>
              {project.contractValueMinor > 0 ? (
                <div className="mt-3">
                  <div className="mb-1 text-[11px] text-muted">{Math.min(100, Math.round((billed / project.contractValueMinor) * 100))}% of contract billed</div>
                  <ProgressBar value={billed} max={project.contractValueMinor} />
                </div>
              ) : null}
            </Panel>
            <Panel title="Client">
              {project.client ? (
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/clients/${project.client.id}`} className="font-medium text-brand hover:underline">{project.client.name}</Link>
                    <HealthBadge health={project.client.health} />
                  </div>
                  {project.client.company ? <div className="text-xs text-muted">{project.client.company}</div> : null}
                  {project.client.email ? <div className="text-xs text-muted">{project.client.email}</div> : null}
                  {project.client.phone ? <div className="text-xs text-muted">{project.client.phone}</div> : null}
                  {project.hideClient ? <Pill>Hidden in client portal</Pill> : null}
                </div>
              ) : (
                <p className="text-sm text-muted">This is an internal project with no client. Use Edit to link one.</p>
              )}
            </Panel>
          </div>
        </div>
      ) : null}

      {tab === "tasks" ? (
        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted">Use the arrows on a card to move it between columns.</p>
            {canWrite ? (
              <ModalButton label="Add task" icon="plus" title="Add task" size="md">
                <ActionForm action={createTask} submitLabel="Add task" pendingLabel="Adding…">
                  <TaskFields projectId={id} members={memberOpts} milestones={milestoneOpts} />
                </ActionForm>
              </ModalButton>
            ) : null}
          </div>
          {total === 0 ? (
            <EmptyPanel
              icon="tasks"
              title="No tasks yet"
              hint="Break the work into tasks and move them across the board as they progress."
              action={
                canWrite ? (
                  <ModalButton label="Add the first task" icon="plus" title="Add task">
                    <ActionForm action={createTask} submitLabel="Add task" pendingLabel="Adding…">
                      <TaskFields projectId={id} members={memberOpts} milestones={milestoneOpts} />
                    </ActionForm>
                  </ModalButton>
                ) : undefined
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
              {TASK_STATUSES.map((s) => {
                const col = tasks.filter((t) => t.status === s);
                return (
                  <section key={s} className="flex min-h-40 flex-col rounded-[var(--radius-card)] border border-border bg-surface" aria-label={TASK_STATUS_LABEL[s]}>
                    <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
                      <h2 className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                        <span className={cx("h-2 w-2 rounded-full", TASK_STATUS_DOT[s])} />
                        {TASK_STATUS_LABEL[s]}
                        <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] normal-case tracking-normal">{col.length}</span>
                      </h2>
                      {canWrite ? (
                        <ModalButton label={`Add to ${TASK_STATUS_LABEL[s]}`} title={`Add task to ${TASK_STATUS_LABEL[s]}`} icon="plus" variant="ghost" className="px-1.5 py-1 text-xs">
                          <ActionForm action={createTask} submitLabel="Add task" pendingLabel="Adding…">
                            <TaskFields projectId={id} members={memberOpts} milestones={milestoneOpts} defaultStatus={s} />
                          </ActionForm>
                        </ModalButton>
                      ) : null}
                    </header>
                    <div className="flex flex-1 flex-col gap-2 p-2">
                      {col.length === 0 ? (
                        <p className="px-1 py-4 text-center text-xs text-muted">Nothing here</p>
                      ) : (
                        col.map((t) => (
                          <TaskCard
                            key={t.id}
                            task={{
                              id: t.id,
                              title: t.title,
                              description: t.description,
                              status: t.status,
                              priority: t.priority,
                              assigneeId: t.assigneeId,
                              milestoneId: t.milestoneId,
                              dueDate: t.dueDate,
                              milestoneName: t.milestoneId ? milestoneName.get(t.milestoneId) : null,
                            }}
                            members={memberOpts}
                            milestones={milestoneOpts}
                            canWrite={canWrite}
                            moveAction={setTaskStatus}
                            updateAction={updateTask}
                            deleteAction={deleteTask}
                          />
                        ))
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {tab === "milestones" ? (
        <Panel
          title="Milestones"
          flush
          action={
            canWrite ? (
              <ModalButton label="Add milestone" icon="plus" variant="secondary" title="Add milestone" className="px-3 py-1.5 text-xs">
                <ActionForm action={createMilestone} submitLabel="Add milestone" pendingLabel="Adding…">
                  <input type="hidden" name="projectId" value={id} />
                  <Field label="Name *">
                    <Input name="name" required maxLength={160} placeholder="Design sign-off" autoComplete="off" />
                  </Field>
                  <Field label="Due date">
                    <Input name="dueDate" type="date" />
                  </Field>
                </ActionForm>
              </ModalButton>
            ) : undefined
          }
        >
          {milestones.length === 0 ? (
            <div className="p-5">
              <EmptyPanel icon="flag" title="No milestones yet" hint="Milestones group tasks into phases with their own due dates." />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {milestones.map((m) => {
                const mt = tasks.filter((t) => t.milestoneId === m.id);
                const md = mt.filter((t) => t.status === "DONE").length;
                const n = daysFromNow(m.dueDate);
                const late = !m.completedAt && n !== null && n < 0;
                return (
                  <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      {canWrite ? (
                        <ActionButton
                          action={toggleMilestone}
                          fields={{ id: m.id }}
                          label={m.completedAt ? "Reopen milestone" : "Mark milestone complete"}
                          icon={m.completedAt ? "check" : "flag"}
                          variant={m.completedAt ? "primary" : "secondary"}
                          onlyIcon
                        />
                      ) : (
                        <Icon name={m.completedAt ? "check" : "flag"} className="h-4 w-4 text-muted" />
                      )}
                      <div className="min-w-0">
                        <div className={cx("truncate font-medium", m.completedAt && "text-muted line-through")}>{m.name}</div>
                        <div className={cx("text-xs", late ? "text-danger" : "text-muted")}>
                          {m.completedAt ? `Completed ${fmtDate(m.completedAt)}` : m.dueDate ? `Due ${fmtDate(m.dueDate)}${late ? " · overdue" : ""}` : "No due date"}
                        </div>
                      </div>
                    </div>
                    <div className="w-32 shrink-0">
                      <div className="mb-1 text-[11px] text-muted">{md}/{mt.length} tasks</div>
                      <ProgressBar value={md} max={mt.length || 1} tone="success" />
                    </div>
                    {canWrite ? (
                      <div className="flex gap-1">
                        <ModalButton label="Edit" title="Edit milestone" icon="edit" variant="ghost" className="px-2.5 py-1.5 text-xs">
                          <ActionForm action={updateMilestone} submitLabel="Save milestone" resetOnSuccess={false}>
                            <input type="hidden" name="id" value={m.id} />
                            <Field label="Name *">
                              <Input name="name" required maxLength={160} defaultValue={m.name} />
                            </Field>
                            <Field label="Due date">
                              <Input name="dueDate" type="date" defaultValue={dateInput(m.dueDate)} />
                            </Field>
                          </ActionForm>
                        </ModalButton>
                        <ActionButton action={deleteMilestone} fields={{ id: m.id }} label="Delete milestone" icon="trash" onlyIcon confirm="Delete this milestone? Its tasks stay on the project." />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      ) : null}

      {tab === "documents" ? <DocumentsTab orgId={orgId} projectId={id} /> : null}
      {tab === "expenses" ? <ExpensesTab orgId={orgId} projectId={id} canWrite={canWrite} total={expenses} /> : null}
      {tab === "decisions" ? <DecisionsTab orgId={orgId} projectId={id} canWrite={canWrite} /> : null}
    </div>
  );
}

/* ── Overview notes ─────────────────────────────────────────────────────── */

async function ProjectNotes({ orgId, projectId, canComment }: { orgId: string; projectId: string; canComment: boolean }) {
  const [comments, members] = await Promise.all([
    prisma.comment.findMany({ where: { orgId, projectId }, orderBy: { createdAt: "desc" }, take: 20 }),
    orgMembers(orgId),
  ]);
  const nameOf = (uid: string) => members.find((m) => m.id === uid)?.name ?? members.find((m) => m.id === uid)?.email ?? "Someone";
  return (
    <Panel title="Team notes">
      {canComment ? (
        <ActionForm action={addProjectComment} submitLabel="Post note" pendingLabel="Posting…" className="mb-4">
          <input type="hidden" name="projectId" value={projectId} />
          <Textarea name="body" required maxLength={4000} aria-label="Note" placeholder="Share an update or a heads-up with the team" />
        </ActionForm>
      ) : null}
      {comments.length === 0 ? (
        <p className="text-sm text-muted">No notes yet.</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="rounded-[var(--radius-control)] bg-surface-2/60 px-3 py-2">
              <div className="text-xs text-muted">
                <span className="font-medium text-text">{nameOf(c.authorId)}</span> · {fmtDateTime(c.createdAt)}
              </div>
              <p className="mt-1 whitespace-pre-line text-sm">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ── Tabs ───────────────────────────────────────────────────────────────── */

async function DocumentsTab({ orgId, projectId }: { orgId: string; projectId: string }) {
  const docs = await prisma.document.findMany({
    where: { orgId, projectId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, title: true, mimeType: true, sizeBytes: true, createdAt: true },
  });
  return (
    <Panel title="Documents" flush action={<ButtonLink href="/documents" variant="secondary" className="px-3 py-1.5 text-xs">Open document hub</ButtonLink>}>
      {docs.length === 0 ? (
        <div className="p-5">
          <EmptyPanel icon="file" title="No documents yet" hint="Files filed against this project in the document hub will be listed here." />
        </div>
      ) : (
        <Table head={["Document", "Type", "Size", "Added"]}>
          {docs.map((d) => (
            <tr key={d.id}>
              <td className="px-4 py-3 font-medium">{d.title}</td>
              <td className="px-4 py-3 text-muted">{d.mimeType}</td>
              <td className="px-4 py-3 text-muted">{formatBytes(d.sizeBytes)}</td>
              <td className="px-4 py-3 text-muted">{fmtDate(d.createdAt)}</td>
            </tr>
          ))}
        </Table>
      )}
    </Panel>
  );
}

async function ExpensesTab({ orgId, projectId, canWrite, total }: { orgId: string; projectId: string; canWrite: boolean; total: number }) {
  const expenses = await prisma.expense.findMany({ where: { orgId, projectId }, orderBy: { spentOn: "desc" }, take: 200 });
  const form = (
    <ActionForm action={logProjectExpense} submitLabel="Log expense" pendingLabel="Saving…">
      <input type="hidden" name="projectId" value={projectId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Category *">
          <Input name="category" required list="expense-categories" maxLength={60} placeholder="Software" autoComplete="off" />
          <datalist id="expense-categories">
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Amount (₹) *">
          <Input name="amount" type="number" required min={0.01} step="0.01" inputMode="decimal" placeholder="2500" />
        </Field>
      </div>
      <Field label="Description *">
        <Input name="description" required maxLength={300} placeholder="Stock photo licence" autoComplete="off" />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Date spent">
          <Input name="spentOn" type="date" defaultValue={dateInput(new Date())} />
        </Field>
        <label className="flex items-center gap-2 self-end rounded-[var(--radius-control)] border border-border bg-surface-2/50 px-3 py-2 text-sm">
          <input type="checkbox" name="gstDeductible" className="h-4 w-4 accent-[var(--color-brand)]" />
          GST claimable
        </label>
      </div>
    </ActionForm>
  );
  return (
    <Panel
      title={`Expenses · ${inr(total)}`}
      flush
      action={
        canWrite ? (
          <ModalButton label="Log expense" icon="plus" variant="secondary" title="Log expense" className="px-3 py-1.5 text-xs">
            {form}
          </ModalButton>
        ) : undefined
      }
    >
      {expenses.length === 0 ? (
        <div className="p-5">
          <EmptyPanel icon="wallet" title="No expenses logged" hint="Track costs against this project to see its real margin." />
        </div>
      ) : (
        <Table head={["Date", "Category", "Description", "Amount", "GST", ""]}>
          {expenses.map((e) => (
            <tr key={e.id}>
              <td className="px-4 py-3 text-muted">{fmtDate(e.spentOn)}</td>
              <td className="px-4 py-3"><Pill>{e.category}</Pill></td>
              <td className="px-4 py-3">{e.description}</td>
              <td className="px-4 py-3 font-medium">{inr(e.amountMinor)}</td>
              <td className="px-4 py-3 text-muted">{e.gstDeductible ? "Claimable" : "—"}</td>
              <td className="px-4 py-3 text-right">
                {canWrite ? <ActionButton action={deleteProjectExpense} fields={{ id: e.id }} label="Delete expense" icon="trash" onlyIcon confirm="Remove this expense?" /> : null}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Panel>
  );
}

async function DecisionsTab({ orgId, projectId, canWrite }: { orgId: string; projectId: string; canWrite: boolean }) {
  const [decisions, members] = await Promise.all([
    prisma.decision.findMany({ where: { orgId, projectId }, orderBy: { createdAt: "desc" }, take: 100 }),
    orgMembers(orgId),
  ]);
  const nameOf = (uid: string) => members.find((m) => m.id === uid)?.name ?? members.find((m) => m.id === uid)?.email ?? "Someone";
  return (
    <Panel
      title="Decisions"
      flush
      action={
        canWrite ? (
          <ModalButton label="Record decision" icon="plus" variant="secondary" title="Record a decision" description="Capture what was decided and why, so it is not lost." className="px-3 py-1.5 text-xs">
            <ActionForm action={createProjectDecision} submitLabel="Save decision" pendingLabel="Saving…">
              <input type="hidden" name="projectId" value={projectId} />
              <Field label="Decision *">
                <Input name="title" required maxLength={200} placeholder="Move launch to the first week of next month" autoComplete="off" />
              </Field>
              <Field label="Reasoning and context *">
                <Textarea name="body" required maxLength={8000} placeholder="Why this, what else was considered, who agreed" />
              </Field>
            </ActionForm>
          </ModalButton>
        ) : undefined
      }
    >
      {decisions.length === 0 ? (
        <div className="p-5">
          <EmptyPanel icon="brain" title="No decisions recorded" hint="Write down scope, pricing and timeline decisions so the reasoning stays with the project." />
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {decisions.map((d) => (
            <li key={d.id} className="px-5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium">{d.title}</div>
                <Badge>{fmtDate(d.createdAt)}</Badge>
              </div>
              <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm text-muted">{d.body}</p>
              <div className="mt-1 text-[11px] text-muted">By {nameOf(d.authorId)}</div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
