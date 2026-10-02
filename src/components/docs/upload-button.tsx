import { ModalButton, ActionForm } from "@/components/kit-client";
import { Field, Input, Select } from "@/components/ui";
import { uploadDocument } from "@/app/actions/documents";
import { MAX_UPLOAD_BYTES, humanAllowedTypes } from "@/lib/documents";
import { formatBytes } from "@/components/docs/doc-utils";

export function UploadDocumentButton({
  clients,
  projects,
  defaultClientId,
  defaultProjectId,
  filingInto,
  variant = "primary",
  label = "Upload document",
}: {
  clients: Array<{ id: string; name: string }>;
  projects: Array<{ id: string; name: string }>;
  defaultClientId?: string;
  defaultProjectId?: string;
  filingInto?: string;
  variant?: "primary" | "secondary";
  label?: string;
}) {
  return (
    <ModalButton
      label={label}
      title="Upload document"
      icon="upload"
      variant={variant}
      description={
        filingInto
          ? `Filing into ${filingInto}. Change the links below to file it somewhere else.`
          : "Add a file and optionally link it to a client or project."
      }
    >
      <ActionForm action={uploadDocument} submitLabel="Upload" pendingLabel="Uploading…">
        <Field label={`File * (max ${formatBytes(MAX_UPLOAD_BYTES)})`}>
          <Input
            name="file"
            type="file"
            required
            accept={humanAllowedTypes}
            className="file:mr-3 file:rounded-[var(--radius-control)] file:border-0 file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-text"
          />
        </Field>
        <Field label="Title (defaults to the file name)">
          <Input name="title" maxLength={200} placeholder="Signed contract — Acme" />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Client">
            <Select name="clientId" defaultValue={defaultClientId ?? ""}>
              <option value="">No client (general)</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Project">
            <Select name="projectId" defaultValue={defaultProjectId ?? ""}>
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <p className="text-xs text-muted">
          Allowed: {humanAllowedTypes}. Linking to a project also files the document under that project&apos;s client.
        </p>
      </ActionForm>
    </ModalButton>
  );
}
