import { Field, Input, Select, Textarea } from "@/components/ui";
import { FormGrid } from "@/components/kit";
import { dateInput } from "@/lib/format";
import { PROJECT_HEALTH, PROJECT_STATUSES, PROJECT_TYPES } from "./constants";

export interface ProjectFormValues {
  id?: string;
  name?: string;
  description?: string | null;
  clientId?: string | null;
  projectType?: string;
  status?: string;
  health?: string;
  contractValueMinor?: number;
  startDate?: Date | null;
  deadline?: Date | null;
  hideClient?: boolean;
}

/** Create / edit project fields. Server-safe; wrap in <ActionForm>. */
export function ProjectFields({
  project,
  clients,
  lockClient,
}: {
  project?: ProjectFormValues;
  clients: Array<{ id: string; name: string; company?: string | null }>;
  /** When set, the client select is prefilled and cannot be changed (new project from a client page). */
  lockClient?: boolean;
}) {
  const p = project ?? {};
  return (
    <div className="flex flex-col gap-4">
      {p.id ? <input type="hidden" name="id" value={p.id} /> : null}
      <Field label="Project name *">
        <Input name="name" required maxLength={120} defaultValue={p.name ?? ""} placeholder="Website redesign" autoComplete="off" />
      </Field>
      <Field label="Description">
        <Textarea name="description" maxLength={4000} defaultValue={p.description ?? ""} placeholder="What is being delivered, and for whom?" />
      </Field>
      <Field label="Client">
        {lockClient && p.clientId ? (
          <>
            <input type="hidden" name="clientId" value={p.clientId} />
            <Select defaultValue={p.clientId} disabled aria-label="Client">
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </>
        ) : (
          <Select name="clientId" defaultValue={p.clientId ?? ""}>
            <option value="">No client (internal)</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.company ? ` · ${c.company}` : ""}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <FormGrid>
        <Field label="Project type">
          <Select name="projectType" defaultValue={p.projectType ?? "FIXED_PRICE"}>
            {PROJECT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select name="status" defaultValue={p.status ?? "PLANNING"}>
            {PROJECT_STATUSES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Health">
          <Select name="health" defaultValue={p.health ?? "ON_TRACK"}>
            {PROJECT_HEALTH.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Contract value (₹)">
          <Input
            name="contractValue"
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            defaultValue={p.contractValueMinor ? String(p.contractValueMinor / 100) : ""}
            placeholder="0"
          />
        </Field>
        <Field label="Start date">
          <Input name="startDate" type="date" defaultValue={dateInput(p.startDate ?? null)} />
        </Field>
        <Field label="Deadline">
          <Input name="deadline" type="date" defaultValue={dateInput(p.deadline ?? null)} />
        </Field>
      </FormGrid>
      <label className="flex items-start gap-3 rounded-[var(--radius-control)] border border-border bg-surface-2/50 p-3">
        <input type="checkbox" name="hideClient" defaultChecked={p.hideClient ?? false} className="mt-0.5 h-4 w-4 accent-[var(--color-brand)]" />
        <span className="text-sm">
          <span className="font-medium">Hide the client in the client portal</span>
          <span className="mt-0.5 block text-xs text-muted">
            The project stays visible to your team, but the client name is kept off anything shared through the portal.
          </span>
        </span>
      </label>
    </div>
  );
}
