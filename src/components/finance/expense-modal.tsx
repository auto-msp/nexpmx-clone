import { ModalButton } from "@/components/kit-client";
import { ActionForm } from "@/components/kit-client";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { dateInput } from "@/lib/format";
import { EXPENSE_CATEGORIES } from "@/components/finance/constants";
import type { ActionResult } from "@/lib/action";

/** "Log expense" button + modal. Server-safe: composes client Modal/ActionForm. */
export function LogExpenseButton({
  action,
  projects,
  variant = "primary",
  label = "Log expense",
}: {
  action: (fd: FormData) => Promise<ActionResult>;
  projects: Array<{ id: string; name: string }>;
  variant?: "primary" | "secondary";
  label?: string;
}) {
  return (
    <ModalButton label={label} title="Log expense" description="Record a business expense." icon="plus" variant={variant}>
      <ActionForm action={action} submitLabel="Save expense">
        <Field label="Category">
          <Select name="category" required defaultValue="">
            <option value="" disabled>
              Select category
            </option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Amount (₹)">
          <Input name="amount" type="number" required min="0.01" step="0.01" inputMode="decimal" placeholder="0.00" />
        </Field>
        <Field label="Description">
          <Textarea name="description" required maxLength={300} placeholder="What was this expense for?" />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Project (optional)">
            <Select name="projectId" defaultValue="">
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date">
            <Input name="spentOn" type="date" required defaultValue={dateInput(new Date())} />
          </Field>
        </div>
        <Field label="Receipt link (optional)">
          <Input name="receiptUrl" type="url" maxLength={500} placeholder="https://…" />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="gstDeductible" className="h-4 w-4 accent-[var(--color-brand)]" />
          GST deductible (input tax credit can be claimed)
        </label>
      </ActionForm>
    </ModalButton>
  );
}
