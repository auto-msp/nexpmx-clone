import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { pageContext } from "@/lib/page";
import { planOf } from "@/lib/plans";
import { storageUsedBytes } from "@/lib/entitlements";
import { signDownloadToken } from "@/lib/documents";
import { fmtDate, sp } from "@/lib/format";
import { PageHeader, KpiGrid, KpiTile, Panel, EmptyPanel, ProgressBar, Avatar } from "@/components/kit";
import { SearchInput, ParamSelect, ViewToggle, ActionButton } from "@/components/kit-client";
import { Icon } from "@/components/kit-icons";
import { ButtonLink, Table, cx } from "@/components/ui";
import { DocCard, TypeTile, type DocRow } from "@/components/docs/doc-card";
import { UploadDocumentButton } from "@/components/docs/upload-button";
import { DOC_TYPES, formatBytes, mimesForType } from "@/components/docs/doc-utils";
import { deleteDocument } from "@/app/actions/documents";

export const metadata: Metadata = { title: "Documents", robots: { index: false } };

const PAGE_SIZE = 48;

type Search = Record<string, string | string[] | undefined>;

function href(params: Record<string, string | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `/documents?${s}` : "/documents";
}

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const raw = await searchParams;
  const q = sp(raw.q).trim();
  const clientParam = sp(raw.client);
  const projectParam = sp(raw.project);
  const typeParam = sp(raw.type);
  const folder = sp(raw.folder);
  const mode = sp(raw.mode);
  const view = sp(raw.view) === "table" ? "table" : "grid";
  const pageNum = Math.max(1, parseInt(sp(raw.page) || "1", 10) || 1);

  const { orgId, canWrite } = await pageContext("document:write");

  // Folder param → filter. Folders are virtual: clients, projects, or "general".
  let folderClient: string | undefined;
  let folderProject: string | undefined;
  let folderGeneral = false;
  if (folder.startsWith("client:")) folderClient = folder.slice(7);
  else if (folder.startsWith("project:")) folderProject = folder.slice(8);
  else if (folder === "general") folderGeneral = true;

  const typeMimes = typeParam ? mimesForType(typeParam) : null;

  const where: Prisma.DocumentWhereInput = {
    orgId,
    ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { originalName: { contains: q, mode: "insensitive" } }] } : {}),
    ...(clientParam || folderClient ? { clientId: folderClient ?? clientParam } : {}),
    ...(projectParam || folderProject ? { projectId: folderProject ?? projectParam } : {}),
    ...(folderGeneral ? { clientId: null, projectId: null } : {}),
    ...(typeMimes ? { mimeType: { in: typeMimes } } : {}),
  };

  const filesMode = Boolean(q || clientParam || projectParam || typeParam || folder || mode === "files");

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [org, clients, projects, usedBytes, totalDocs, monthDocs, generalCount, clientCounts, projectCounts, matchCount, docs] =
    await Promise.all([
      prisma.organization.findUnique({ where: { id: orgId }, select: { plan: true, storageLimitMb: true } }),
      prisma.client.findMany({ where: { orgId }, select: { id: true, name: true, status: true }, orderBy: { name: "asc" } }),
      prisma.project.findMany({ where: { orgId }, select: { id: true, name: true, clientId: true }, orderBy: { name: "asc" } }),
      storageUsedBytes(orgId),
      prisma.document.count({ where: { orgId } }),
      prisma.document.count({ where: { orgId, createdAt: { gte: monthStart } } }),
      prisma.document.count({ where: { orgId, clientId: null, projectId: null } }),
      prisma.document.groupBy({ by: ["clientId"], where: { orgId, clientId: { not: null } }, _count: { _all: true } }),
      prisma.document.groupBy({ by: ["projectId"], where: { orgId, projectId: { not: null } }, _count: { _all: true } }),
      filesMode ? prisma.document.count({ where }) : Promise.resolve(0),
      filesMode
        ? prisma.document.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (pageNum - 1) * PAGE_SIZE,
            take: PAGE_SIZE,
            include: {
              uploader: { select: { name: true } },
              client: { select: { name: true } },
              project: { select: { name: true } },
            },
          })
        : Promise.resolve([]),
    ]);

  const plan = planOf(org?.plan);
  const capMb = Math.max(org?.storageLimitMb ?? 0, plan.storageMb);
  const capBytes = capMb * 1024 * 1024;
  const usedPct = Math.min(100, Math.round((usedBytes / capBytes) * 100));

  const clientCount = new Map(clientCounts.map((c) => [c.clientId as string, c._count._all]));
  const projectCount = new Map(projectCounts.map((p) => [p.projectId as string, p._count._all]));
  const activeClients = clients.filter((c) => c.status === "ACTIVE" || (clientCount.get(c.id) ?? 0) > 0);

  const rows: DocRow[] = docs.map((d) => ({
    id: d.id,
    title: d.title,
    originalName: d.originalName,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    createdAt: d.createdAt,
    uploaderName: d.uploader.name,
    clientName: d.client?.name ?? null,
    projectName: d.project?.name ?? null,
    href: `/api/download/${d.id}?t=${encodeURIComponent(
      signDownloadToken({ documentId: d.id, orgId, expiresAt: Date.now() + 15 * 60 * 1000 }),
    )}`,
  }));

  // Label of the folder currently open (for the breadcrumb + upload defaults).
  let folderLabel: string | null = null;
  if (folderClient) folderLabel = clients.find((c) => c.id === folderClient)?.name ?? "Client";
  else if (folderProject) folderLabel = projects.find((p) => p.id === folderProject)?.name ?? "Project";
  else if (folderGeneral) folderLabel = "General";

  const pages = Math.max(1, Math.ceil(matchCount / PAGE_SIZE));
  const keep = { q: q || undefined, client: clientParam || undefined, project: projectParam || undefined, type: typeParam || undefined, folder: folder || undefined, mode: mode || undefined, view: view === "table" ? "table" : undefined };

  const navItem = (label: string, to: string, active: boolean, count?: number, icon = "folder") => (
    <Link
      key={to + label}
      href={to}
      aria-current={active ? "page" : undefined}
      className={cx(
        "flex items-center justify-between gap-2 rounded-[var(--radius-control)] px-2.5 py-1.5 text-sm",
        active ? "bg-brand/15 font-medium text-brand" : "text-muted hover:bg-surface-2 hover:text-text",
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Icon name={icon} className="h-4 w-4 shrink-0" />
        <span className="truncate">{label}</span>
      </span>
      {count !== undefined ? <span className="text-xs tabular-nums">{count}</span> : null}
    </Link>
  );

  const uploadBtn = canWrite ? (
    <UploadDocumentButton
      clients={clients.filter((c) => c.status === "ACTIVE")}
      projects={projects}
      defaultClientId={folderClient}
      defaultProjectId={folderProject}
      filingInto={folderLabel ?? "General"}
    />
  ) : null;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Document hub"
        subtitle="Contracts, briefs and deliverables, filed under the client or project they belong to."
        actions={uploadBtn}
      />

      <KpiGrid cols={4}>
        <KpiTile label="Documents" value={totalDocs.toLocaleString("en-IN")} hint={`${clientCounts.length} client folder${clientCounts.length === 1 ? "" : "s"} in use`} icon="file" />
        <KpiTile
          label="Storage used"
          value={formatBytes(usedBytes)}
          hint={`of ${capMb.toLocaleString("en-IN")} MB · ${usedPct}%`}
          icon="folder"
          tone={usedPct >= 90 ? "danger" : usedPct >= 75 ? "warn" : "neutral"}
        />
        <KpiTile label="Uploaded this month" value={monthDocs} hint={fmtDate(monthStart) + " onwards"} icon="upload" tone="brand" />
        <KpiTile label="Not filed anywhere" value={generalCount} hint="General documents" icon="alert" tone={generalCount > 0 ? "warn" : "neutral"} />
      </KpiGrid>
      <div className="-mt-3 mb-6">
        <ProgressBar value={usedBytes} max={capBytes} tone={usedPct >= 90 ? "danger" : usedPct >= 75 ? "warn" : "brand"} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
        {/* Folder navigation */}
        <aside className="space-y-4">
          <Panel title="Browse" flush>
            <nav className="space-y-0.5 p-2" aria-label="Document folders">
              {navItem("Folder overview", "/documents", !filesMode, undefined, "grid")}
              {navItem("All documents", "/documents?mode=files", filesMode && !folder && !q && !clientParam && !projectParam && !typeParam, totalDocs, "file")}
              {navItem("General", href({ folder: "general" }), folderGeneral, generalCount, "folder")}
            </nav>
          </Panel>
          <Panel title="Clients" flush>
            <nav className="max-h-72 space-y-0.5 overflow-y-auto p-2" aria-label="Client folders">
              {activeClients.length === 0 ? <p className="px-2.5 py-2 text-xs text-muted">No clients yet.</p> : null}
              {activeClients.map((c) => navItem(c.name, href({ folder: `client:${c.id}` }), folderClient === c.id, clientCount.get(c.id) ?? 0, "building"))}
            </nav>
          </Panel>
          {projects.length > 0 ? (
            <Panel title="Projects" flush>
              <nav className="max-h-72 space-y-0.5 overflow-y-auto p-2" aria-label="Project folders">
                {projects.map((p) => navItem(p.name, href({ folder: `project:${p.id}` }), folderProject === p.id, projectCount.get(p.id) ?? 0, "tasks"))}
              </nav>
            </Panel>
          ) : null}
        </aside>

        {/* Main column */}
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput param="q" placeholder="Search documents…" className="min-w-0 flex-1 basis-56" />
            <ParamSelect param="client" allLabel="All clients" options={clients.map((c) => ({ value: c.id, label: c.name }))} className="max-w-44" />
            <ParamSelect param="project" allLabel="All projects" options={projects.map((p) => ({ value: p.id, label: p.name }))} className="max-w-44" />
            <ParamSelect param="type" allLabel="All types" options={DOC_TYPES.map((t) => ({ value: t.key, label: t.label }))} />
            {filesMode ? <ViewToggle param="view" fallback="grid" /> : null}
          </div>

          {!filesMode ? (
            totalDocs === 0 && clients.length === 0 ? (
              <EmptyPanel
                icon="folder"
                title="No documents yet"
                hint="Upload a contract, a brief or a deliverable. Files are filed under a client or project so the whole team can find them."
                action={uploadBtn}
              />
            ) : (
              <div className="space-y-6">
                <section>
                  <h2 className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Folders</h2>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {activeClients.map((c) => (
                      <FolderTile key={c.id} to={href({ folder: `client:${c.id}` })} icon="building" name={c.name} count={clientCount.get(c.id) ?? 0} />
                    ))}
                    <FolderTile to={href({ folder: "general" })} icon="folder" name="General" count={generalCount} dashed />
                  </div>
                </section>
                {projects.length > 0 ? (
                  <section>
                    <h2 className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Project folders</h2>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {projects.map((p) => (
                        <FolderTile key={p.id} to={href({ folder: `project:${p.id}` })} icon="tasks" name={p.name} count={projectCount.get(p.id) ?? 0} />
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            )
          ) : (
            <>
              {folderLabel ? (
                <div className="flex items-center justify-between gap-3">
                  <Link href="/documents" className="inline-flex items-center gap-1 text-xs text-muted hover:text-text">
                    <Icon name="chevronLeft" className="h-3.5 w-3.5" />
                    All folders
                  </Link>
                  <span className="text-sm font-medium">{folderLabel}</span>
                </div>
              ) : null}

              {rows.length === 0 ? (
                totalDocs === 0 ? (
                  <EmptyPanel icon="file" title="No documents yet" hint="Upload the first file to start the library." action={uploadBtn} />
                ) : (
                  <EmptyPanel
                    icon="search"
                    title="No documents match"
                    hint="Try a different search or clear the filters."
                    action={<ButtonLink href="/documents?mode=files" variant="secondary">Clear filters</ButtonLink>}
                  />
                )
              ) : view === "table" ? (
                <Table head={["Document", "Linked to", "Size", "Uploaded", ""]}>
                  {rows.map((d) => (
                    <tr key={d.id}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <TypeTile mime={d.mimeType} size="sm" />
                          <div className="min-w-0">
                            <div className="truncate font-medium">{d.title}</div>
                            <div className="truncate text-xs text-muted">{d.originalName}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted">{[d.clientName, d.projectName].filter(Boolean).join(" · ") || "General"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted">{formatBytes(d.sizeBytes)}</td>
                      <td className="px-4 py-3 text-muted">
                        <span className="inline-flex items-center gap-2">
                          <Avatar name={d.uploaderName ?? "Member"} size="sm" />
                          {fmtDate(d.createdAt)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <a href={d.href} aria-label={`Download ${d.title}`} title="Download" className="rounded-[var(--radius-control)] p-1.5 text-muted hover:bg-surface-2 hover:text-text">
                            <Icon name="download" className="h-4 w-4" />
                          </a>
                          {canWrite ? (
                            <ActionButton action={deleteDocument} fields={{ id: d.id }} label={`Delete ${d.title}`} icon="trash" onlyIcon confirm={`Delete "${d.title}"? This removes the file permanently.`} />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </Table>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {rows.map((d) => (
                    <DocCard key={d.id} doc={d} canWrite={canWrite} />
                  ))}
                </div>
              )}

              {pages > 1 ? (
                <div className="flex items-center justify-between gap-3 text-sm text-muted">
                  <span>
                    Page {pageNum} of {pages} · {matchCount} documents
                  </span>
                  <span className="flex gap-2">
                    {pageNum > 1 ? (
                      <ButtonLink variant="secondary" href={href({ ...keep, mode: keep.mode ?? "files", page: String(pageNum - 1) })}>
                        Previous
                      </ButtonLink>
                    ) : null}
                    {pageNum < pages ? (
                      <ButtonLink variant="secondary" href={href({ ...keep, mode: keep.mode ?? "files", page: String(pageNum + 1) })}>
                        Next
                      </ButtonLink>
                    ) : null}
                  </span>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FolderTile({ to, icon, name, count, dashed }: { to: string; icon: string; name: string; count: number; dashed?: boolean }) {
  return (
    <Link
      href={to}
      className={cx(
        "flex items-center gap-3 rounded-[var(--radius-card)] border bg-surface p-4 transition-colors hover:border-brand",
        dashed ? "border-dashed border-border" : "border-border",
      )}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-brand/15 text-brand">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{name}</span>
        <span className="block text-xs text-muted">
          {count} file{count === 1 ? "" : "s"}
        </span>
      </span>
    </Link>
  );
}
