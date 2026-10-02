/**
 * Document Hub helpers shared by the page and its cards (server-safe).
 * Type groups are derived from the stored mime type only.
 */

export type DocTypeKey = "pdf" | "image" | "doc" | "sheet" | "slides" | "archive" | "data";

export const DOC_TYPES: Array<{ key: DocTypeKey; label: string; ext: string; mimes: string[]; tone: string }> = [
  { key: "pdf", label: "PDF", ext: "PDF", mimes: ["application/pdf"], tone: "bg-danger/15 text-danger" },
  {
    key: "image",
    label: "Images",
    ext: "IMG",
    mimes: ["image/png", "image/jpeg", "image/gif", "image/webp"],
    tone: "bg-success/15 text-success",
  },
  {
    key: "doc",
    label: "Documents & text",
    ext: "DOC",
    mimes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"],
    tone: "bg-brand/15 text-brand",
  },
  {
    key: "sheet",
    label: "Spreadsheets",
    ext: "XLS",
    mimes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/csv"],
    tone: "bg-success/15 text-success",
  },
  {
    key: "slides",
    label: "Presentations",
    ext: "PPT",
    mimes: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
    tone: "bg-warn/15 text-warn",
  },
  { key: "archive", label: "Archives", ext: "ZIP", mimes: ["application/zip"], tone: "bg-surface-2 text-muted" },
  { key: "data", label: "Data (JSON)", ext: "JSON", mimes: ["application/json"], tone: "bg-surface-2 text-muted" },
];

export function docTypeOf(mime: string): { key: DocTypeKey | "other"; label: string; ext: string; tone: string } {
  const hit = DOC_TYPES.find((t) => t.mimes.includes(mime));
  return hit ?? { key: "other", label: "File", ext: "FILE", tone: "bg-surface-2 text-muted" };
}

export function mimesForType(key: string): string[] | null {
  return DOC_TYPES.find((t) => t.key === key)?.mimes ?? null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
