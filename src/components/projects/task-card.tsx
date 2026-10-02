import type { ReactNode } from "react";
import { Avatar } from "@/components/kit";
import { ActionButton, ActionForm, ModalButton } from "@/components/kit-client";
import { Icon } from "@/components/kit-icons";
import { cx } from "@/components/ui";
import { daysFromNow, fmtDate } from "@/lib/format";
import type { ActionResult } from "@/lib/action";
import { PRIORITY_TONE, TASK_PRIORITIES, TASK_STATUSES, TASK_STATUS_LABEL, type TaskStatusKey } from "./constants";
import { TaskFields } from "./task-fields";

export interface TaskCardData {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatusKey;
  priority: string;
  assigneeId: string | null;
  milestoneId: string | null;
  dueDate: Date | null;
  milestoneName?: string | null;
}

type Action = (fd: FormData) => Promise<ActionResult>;

/**
 * Kanban card. Moves between columns with the arrow buttons (one-click actions),
 * edit / delete live behind the pencil and bin. Server-safe wrapper of client controls.
 */
export function TaskCard({
  task,
  members,
  milestones,
  canWrite,
  moveAction,
  updateAction,
  deleteAction,
  extra,
}: {
  task: TaskCardData;
  members: Array<{ id: string; name: string | null; email: string | null }>;
  milestones: Array<{ id: string; name: string }>;
  canWrite: boolean;
  moveAction: Action;
  updateAction: Action;
  deleteAction: Action;
  extra?: ReactNode;
}) {
  const idx = TASK_STATUSES.indexOf(task.status);
  const prev = idx > 0 ? TASK_STATUSES[idx - 1] : null;
  const next = idx < TASK_STATUSES.length - 1 ? TASK_STATUSES[idx + 1] : null;
  const assignee = members.find((m) => m.id === task.assigneeId);
  const due = daysFromNow(task.dueDate);
  const overdue = due !== null && due < 0 && task.status !== "DONE";
  const priorityLabel = TASK_PRIORITIES.find((p) => p.value === task.priority)?.label ?? task.priority;

  return (
    <article className="rounded-[var(--radius-control)] border border-border bg-surface-2/60 p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <h3 className={cx("min-w-0 break-words font-medium", task.status === "DONE" && "text-muted line-through")}>{task.title}</h3>
        <span className="mt-1.5 flex shrink-0 items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted" title={`${priorityLabel} priority`}>
          <span className={cx("h-2 w-2 rounded-full", PRIORITY_TONE[task.priority] ?? "bg-muted")} />
          {priorityLabel}
        </span>
      </div>
      {task.description ? <p className="mt-1 line-clamp-2 text-xs text-muted">{task.description}</p> : null}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
        {task.milestoneName ? (
          <span className="inline-flex items-center gap-1">
            <Icon name="flag" className="h-3 w-3" />
            {task.milestoneName}
          </span>
        ) : null}
        {task.dueDate ? (
          <span className={cx("inline-flex items-center gap-1", overdue && "text-danger")}>
            <Icon name="calendar" className="h-3 w-3" />
            {fmtDate(task.dueDate)}
          </span>
        ) : null}
        {assignee ? (
          <span className="ml-auto inline-flex items-center gap-1">
            <Avatar name={assignee.name ?? assignee.email} size="sm" />
          </span>
        ) : null}
      </div>
      {extra}
      {canWrite ? (
        <div className="mt-2 flex items-center justify-between gap-1 border-t border-border pt-2">
          <div className="flex gap-1">
            {prev ? (
              <ActionButton action={moveAction} fields={{ id: task.id, status: prev }} label={`Move to ${TASK_STATUS_LABEL[prev]}`} icon="chevronLeft" onlyIcon />
            ) : null}
            {next ? (
              <ActionButton action={moveAction} fields={{ id: task.id, status: next }} label={`Move to ${TASK_STATUS_LABEL[next]}`} icon="chevronRight" onlyIcon />
            ) : null}
          </div>
          <div className="flex gap-1">
            <ModalButton label="Edit" title="Edit task" icon="edit" variant="ghost" className="px-2.5 py-1.5 text-xs">
              <ActionForm action={updateAction} submitLabel="Save task" resetOnSuccess={false}>
                <TaskFields task={task} members={members} milestones={milestones} />
              </ActionForm>
            </ModalButton>
            <ActionButton action={deleteAction} fields={{ id: task.id }} label="Delete task" icon="trash" onlyIcon confirm="Delete this task?" />
          </div>
        </div>
      ) : null}
    </article>
  );
}
