import { ModalButton, ActionForm } from "@/components/kit-client";
import { Field, Input } from "@/components/ui";
import { createSheet, renameSheet } from "@/app/actions/sheets";

export function NewSheetButton({ label = "New sheet", variant = "primary" }: { label?: string; variant?: "primary" | "secondary" }) {
  return (
    <ModalButton label={label} title="New sheet" icon="plus" variant={variant} size="sm" description="Give it a name now. You can rename it later.">
      <ActionForm action={createSheet} submitLabel="Create sheet" pendingLabel="Creating…">
        <Field label="Sheet title *">
          <Input name="title" required maxLength={120} placeholder="Q4 budget tracker" autoFocus />
        </Field>
      </ActionForm>
    </ModalButton>
  );
}

export function RenameSheetButton({
  sheetId,
  title,
  variant = "ghost",
  iconOnly,
}: {
  sheetId: string;
  title: string;
  variant?: "ghost" | "secondary";
  iconOnly?: boolean;
}) {
  return (
    <ModalButton label={iconOnly ? "" : "Rename"} icon="edit" title="Rename sheet" variant={variant} size="sm" className={iconOnly ? "px-2 py-1.5 text-xs" : "px-3 py-1.5 text-xs"}>
      <ActionForm action={renameSheet} submitLabel="Save name" resetOnSuccess={false}>
        <input type="hidden" name="id" value={sheetId} />
        <Field label="Sheet title *">
          <Input name="title" required maxLength={120} defaultValue={title} autoFocus />
        </Field>
      </ActionForm>
    </ModalButton>
  );
}
