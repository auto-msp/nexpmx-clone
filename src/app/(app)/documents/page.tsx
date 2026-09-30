import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { getOrgContext } from "@/lib/tenancy";
import { prisma } from "@/lib/db";
import { canRead, can } from "@/lib/rbac";
import { planOf } from "@/lib/plans";
import { storageUsedBytes } from "@/lib/entitlements";
import { signDownloadToken, MAX_UPLOAD_BYTES, humanAllowedTypes } from "@/lib/documents";
import { uploadDocument, deleteDocument } from "@/app/actions/documents";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  SectionTitle,
  Select,
  Table,
} from "@/components/ui";

export const metadata: Metadata = { title: "Documents", robots: { index: false } };

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function DocumentsPage() {
  const session = await auth();
  const ctx = await getOrgContext(session!.user!.id);
  if (!canRead(ctx!.role)) throw new Error("Forbidden");

  const orgId = ctx!.orgId;

  const [docs, clients, projects, org, used] = await Promise.all([
    prisma.document.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      include: {
        uploader: { select: { name: true } },
        client: { select: { name: true } },
        project: { select: { name: true } },
      },
    }),
    prisma.client.findMany({
      where: { orgId, status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.project.findMany({
      where: { orgId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.organization.findUnique({
      where: { id: orgId },
      select: { plan: true },
    }),
    storageUsedBytes(orgId),
  ]);

  const plan = planOf(org?.plan);
  const capMb = plan.storageMb;
  const usedPct = Math.min(100, Math.round((used / (capMb * 1024 * 1024)) * 100));

  const downloadHref = (documentId: string) => {
    const token = signDownloadToken({
      documentId,
      orgId,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });
    return `/api/download/${documentId}?t=${encodeURIComponent(token)}`;
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
        <p className="mt-1 text-sm text-muted">
          Files tied to clients and projects — part of the shared memory, not
          scattered across inboxes.
        </p>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionTitle>Upload a document</SectionTitle>
          <span className="text-xs text-muted">
            {formatBytes(used)} of {capMb.toLocaleString("en-IN")} MB used ({usedPct}%)
          </span>
        </div>
        <form action={uploadDocument} className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Title *">
            <Input name="title" required maxLength={200} placeholder="Signed contract — Acme" />
          </Field>
          <Field label={`File * (max ${formatBytes(MAX_UPLOAD_BYTES)})`}>
            <Input
              name="file"
              type="file"
              required
              accept={humanAllowedTypes}
              className="file:mr-3 file:rounded-[var(--radius-control)] file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm"
            />
          </Field>
          <Field label="Client">
            <Select name="clientId" defaultValue="">
              <option value="">— none —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Project">
            <Select name="projectId" defaultValue="">
              <option value="">— none —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit">Upload</Button>
          </div>
        </form>
      </Card>

      {docs.length === 0 ? (
        <EmptyState
          title="No documents yet"
          hint="Upload contracts, briefs or deliverables to keep them with the client's memory."
        />
      ) : (
        <Table head={["Document", "Linked to", "Size", "Uploaded", ""]}>
          {docs.map((d) => (
            <tr key={d.id}>
              <td className="px-4 py-3">
                <div className="font-medium">{d.title}</div>
                <div className="text-xs text-muted">
                  {d.originalName} · {d.mimeType}
                </div>
              </td>
              <td className="px-4 py-3 text-muted">
                {[d.client?.name, d.project?.name].filter(Boolean).join(" · ") || "—"}
              </td>
              <td className="px-4 py-3 text-muted">{formatBytes(d.sizeBytes)}</td>
              <td className="px-4 py-3 text-muted">
                {d.createdAt.toISOString().slice(0, 10)} · {d.uploader.name ?? "member"}
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-2">
                  <a
                    href={downloadHref(d.id)}
                    className="rounded-[var(--radius-control)] border border-border px-3 py-1.5 text-sm text-muted hover:border-brand hover:text-text"
                  >
                    Download
                  </a>
                  {can(ctx!.role, "document:write") ? (
                    <form action={deleteDocument}>
                      <input type="hidden" name="id" value={d.id} />
                      <Button variant="ghost" type="submit">Delete</Button>
                    </form>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
