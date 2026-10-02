import { Avatar } from "@/components/kit";
import { ActionButton } from "@/components/kit-client";
import { Icon } from "@/components/kit-icons";
import { fmtDate } from "@/lib/format";
import { deleteDocument } from "@/app/actions/documents";
import { cx } from "@/components/ui";
import { docTypeOf, formatBytes } from "@/components/docs/doc-utils";

export type DocRow = {
  id: string;
  title: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
  uploaderName: string | null;
  clientName: string | null;
  projectName: string | null;
  href: string;
};

export function TypeTile({ mime, size = "md" }: { mime: string; size?: "sm" | "md" }) {
  const t = docTypeOf(mime);
  return (
    <span
      aria-hidden
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-[var(--radius-control)] font-mono font-semibold tracking-wider",
        size === "md" ? "h-11 w-11 text-[11px]" : "h-8 w-8 text-[9px]",
        t.tone,
      )}
    >
      {t.ext}
    </span>
  );
}

export function DocCard({ doc, canWrite }: { doc: DocRow; canWrite: boolean }) {
  const linked = [doc.clientName, doc.projectName].filter(Boolean) as string[];
  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4 transition-colors hover:border-brand/60">
      <div className="flex items-start gap-3">
        <TypeTile mime={doc.mimeType} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={doc.title}>
            {doc.title}
          </p>
          <p className="truncate text-xs text-muted" title={doc.originalName}>
            {doc.originalName}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-muted">{formatBytes(doc.sizeBytes)}</span>
        {linked.length > 0 ? (
          linked.map((l) => (
            <span key={l} className="inline-flex items-center gap-1 rounded-full bg-brand/15 px-2 py-0.5 text-brand">
              <Icon name="link" className="h-3 w-3" />
              {l}
            </span>
          ))
        ) : (
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-muted">General</span>
        )}
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-3">
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted">
          <Avatar name={doc.uploaderName ?? "Member"} size="sm" />
          <span className="truncate">
            {doc.uploaderName ?? "Member"} · {fmtDate(doc.createdAt)}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <a
            href={doc.href}
            aria-label={`Download ${doc.title}`}
            title="Download"
            className="rounded-[var(--radius-control)] p-1.5 text-muted hover:bg-surface-2 hover:text-text"
          >
            <Icon name="download" className="h-4 w-4" />
          </a>
          {canWrite ? (
            <ActionButton
              action={deleteDocument}
              fields={{ id: doc.id }}
              label={`Delete ${doc.title}`}
              icon="trash"
              onlyIcon
              confirm={`Delete "${doc.title}"? This removes the file permanently.`}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
