import { TRIGGER_OPTIONS } from "@/lib/automations";
import { cx } from "@/components/ui";
import { FieldLabel, Input, Select } from "@/components/ai/fields";
import { ScopePicker } from "@/components/ai/ai-bits";

const EFFECTS = [
  { name: "notifyFounders", label: "Notify the founders" },
  { name: "notifyClient", label: "Notify the client" },
  { name: "createTask", label: "Create a follow-up task" },
] as const;

/** Fields of the "New automation" form. */
export function AutomationFields({
  clients,
  projects,
}: {
  clients: Array<{ id: string; name: string }>;
  projects: Array<{ id: string; name: string }>;
}) {
  return (
    <>
      <label className="block">
        <FieldLabel>Name</FieldLabel>
        <Input name="name" required maxLength={120} placeholder="Chase the client when an invoice is paid late" />
      </label>
      <label className="block">
        <FieldLabel>When this happens</FieldLabel>
        <Select name="trigger" defaultValue="invoice.paid" required>
          {TRIGGER_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
      </label>
      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-muted">Do this</legend>
        <div className="flex flex-wrap gap-2">
          {EFFECTS.map((e) => (
            <label
              key={e.name}
              className={cx(
                "inline-flex cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-border bg-surface-2 px-3 py-2 text-sm text-muted",
                "has-[:checked]:border-brand has-[:checked]:bg-brand/15 has-[:checked]:text-text",
              )}
            >
              <input type="checkbox" name={e.name} className="h-4 w-4 accent-brand" />
              {e.label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block">
        <FieldLabel hint="Used as the task title">Task title</FieldLabel>
        <Input name="taskTitle" maxLength={200} placeholder="e.g. Follow up on this project" />
      </label>
      <div>
        <FieldLabel>Watch</FieldLabel>
        <ScopePicker
          clients={clients}
          projects={projects}
          scopeName="watchScope"
          clientName="watchClientId"
          projectName="watchProjectId"
          helpAll="Fires for every client and every project."
        />
      </div>
    </>
  );
}
