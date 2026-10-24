import { Field, Input, Select, Textarea } from "@/components/ui";
import { FormGrid } from "@/components/kit";
import { dateInput } from "@/lib/format";
import { TASK_PRIORITIES, TASK_STATUSES, TASK_STATUS_LABEL } from "./constants";

export interface TaskFormValues {
  id?: string;
  title?: string;
  description?: string | null;
  status?: string;
  priority?: string;
  assigneeId?: string | null;
  milestoneId?: string | null;
  dueDate?: Date | null;
}

/** Add / edit task fields. Server-safe; wrap in <ActionForm>. */
export function TaskFields({
  task,
  projectId,
  members,
  milestones,
  defaultStatus,
  defaultMilestoneId,
}: {
  task?: TaskFormValues;
  projectId?: string;
  members: Array<{ id: string; name: string | null; email: string | null }>;
  milestones: Array<{ id: string; name: string }>;
  defaultStatus?: string;
  defaultMilestoneId?: string | null;
}) {
  const t = task ?? {};
  return (
    <div className="flex flex-col gap-4">
      {t.id ? <input type="hidden" name="id" value={t.id} /> : null}
      {projectId ? <input type="hidden" name="projectId" value={projectId} /> : null}
      <Field label="Title *">
        <Input name="title" required maxLength={200} defaultValue={t.title ?? ""} placeholder="Draft the homepage wireframes" autoComplete="off" />
      </Field>
      <Field label="Description">
        <Textarea name="description" maxLength={4000} defaultValue={t.description ?? ""} placeholder="Details, links, acceptance criteria" />
      </Field>
      <FormGrid>
        <Field label="Status">
          <Select name="status" defaultValue={t.status ?? defaultStatus ?? "TODO"}>
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>
            ))}
          </Select>
        </Field>
        <Field label="Priority">
          <Select name="priority" defaultValue={t.priority ?? "MEDIUM"}>
            {TASK_PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Assignee">
          <Select name="assigneeId" defaultValue={t.assigneeId ?? ""}>
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name ?? m.email ?? "Member"}</option>
            ))}
          </Select>
        </Field>
        <Field label="Due date">
          <Input name="dueDate" type="date" defaultValue={dateInput(t.dueDate ?? null)} />
        </Field>
      </FormGrid>
      <Field label="Milestone">
        <Select name="milestoneId" defaultValue={t.milestoneId ?? defaultMilestoneId ?? ""}>
          <option value="">Not in a milestone</option>
          {milestones.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </Select>
      </Field>
    </div>
  );
}
