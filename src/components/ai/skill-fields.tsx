import { EmployeeChips, FieldLabel, Input, Textarea } from "@/components/ai/fields";
import { ScopePicker } from "@/components/ai/ai-bits";

export interface SkillFieldValues {
  id?: string;
  name: string;
  description: string;
  instructions: string;
  scope: string;
  scopeId: string;
  assigned: string[];
}

/** Shared fields of the "New skill" and "Edit skill" forms. */
export function SkillFields({
  team,
  clients,
  projects,
  values,
}: {
  team: Array<{ key: string; name: string; role: string }>;
  clients: Array<{ id: string; name: string }>;
  projects: Array<{ id: string; name: string }>;
  values?: SkillFieldValues;
}) {
  return (
    <>
      {values?.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <FieldLabel>Name</FieldLabel>
          <Input name="name" required maxLength={120} defaultValue={values?.name} placeholder="Client onboarding steps" />
        </label>
        <label className="block">
          <FieldLabel hint="Optional">Short description</FieldLabel>
          <Input name="description" maxLength={240} defaultValue={values?.description} placeholder="How we bring a new client on board" />
        </label>
      </div>
      <label className="block">
        <FieldLabel hint="Paste a process or write it out">Instructions</FieldLabel>
        <Textarea
          name="instructions"
          required
          minLength={10}
          maxLength={8000}
          defaultValue={values?.instructions}
          placeholder="Write the steps in order. The teammates you choose below will follow them."
          className="min-h-40"
        />
      </label>
      <div>
        <FieldLabel>Where it applies</FieldLabel>
        <ScopePicker
          clients={clients}
          projects={projects}
          defaultScope={values?.scope ?? "ALL"}
          defaultClientId={values?.scope === "CLIENT" ? values.scopeId : ""}
          defaultProjectId={values?.scope === "PROJECT" ? values.scopeId : ""}
        />
      </div>
      <div>
        <FieldLabel>Teach it to</FieldLabel>
        <EmployeeChips employees={team} defaultKeys={values?.assigned ?? []} />
      </div>
    </>
  );
}
