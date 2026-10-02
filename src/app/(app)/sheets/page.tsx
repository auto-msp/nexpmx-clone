import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { pageContext, orgMembers } from "@/lib/page";
import { fmtDate, relTime, sp } from "@/lib/format";
import { PageHeader, EmptyPanel, Avatar } from "@/components/kit";
import { SearchInput, ViewToggle, ActionButton } from "@/components/kit-client";
import { Icon } from "@/components/kit-icons";
import { ButtonLink, Table } from "@/components/ui";
import { NewSheetButton, RenameSheetButton } from "@/components/docs/sheet-forms";
import { deleteSheet } from "@/app/actions/sheets";

export const metadata: Metadata = { title: "Sheets", robots: { index: false } };

function cellCount(json: string): number {
  try {
    return Object.keys(JSON.parse(json) as Record<string, unknown>).length;
  } catch {
    return 0;
  }
}

export default async function SheetsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const q = sp(raw.q).trim();
  const view = sp(raw.view) === "table" ? "table" : "grid";
  const { orgId, canWrite } = await pageContext("project:write");

  const [sheets, total, members] = await Promise.all([
    prisma.sheet.findMany({
      where: { orgId, ...(q ? { title: { contains: q, mode: "insensitive" } } : {}) },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: { id: true, title: true, cellsJson: true, updatedAt: true, createdAt: true, updatedBy: true },
    }),
    prisma.sheet.count({ where: { orgId } }),
    orgMembers(orgId),
  ]);
  const nameOf = new Map(members.map((m) => [m.id, m.name ?? m.email]));
  const rows = sheets.map((s) => ({ ...s, cells: cellCount(s.cellsJson), editor: s.updatedBy ? nameOf.get(s.updatedBy) ?? null : null }));

  const newBtn = canWrite ? <NewSheetButton /> : null;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Sheets" subtitle="Budgets, trackers and quick calculations, saved with the rest of your workspace." actions={newBtn} />

      {total === 0 ? (
        <EmptyPanel
          icon="grid"
          title="No sheets yet"
          hint="Create your first spreadsheet. It supports formulas, currency formats and CSV export."
          action={canWrite ? <NewSheetButton label="Create sheet" /> : undefined}
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <SearchInput param="q" placeholder="Search sheets…" className="min-w-0 flex-1 basis-56" />
            <ViewToggle param="view" fallback="grid" />
          </div>

          {rows.length === 0 ? (
            <EmptyPanel icon="search" title="No sheets match" hint="Try a different name." action={<ButtonLink href="/sheets" variant="secondary">Clear search</ButtonLink>} />
          ) : view === "table" ? (
            <Table head={["Sheet", "Filled cells", "Last edited", "Created", ""]}>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3">
                    <Link href={`/sheets/${s.id}`} className="inline-flex items-center gap-2 font-medium hover:text-brand">
                      <Icon name="grid" className="h-4 w-4 text-muted" />
                      {s.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted">{s.cells}</td>
                  <td className="px-4 py-3 text-muted">
                    {relTime(s.updatedAt)}
                    {s.editor ? ` · ${s.editor}` : ""}
                  </td>
                  <td className="px-4 py-3 text-muted">{fmtDate(s.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <ButtonLink href={`/sheets/${s.id}`} variant="secondary" className="px-3 py-1.5 text-xs">
                        Open
                      </ButtonLink>
                      {canWrite ? (
                        <>
                          <RenameSheetButton sheetId={s.id} title={s.title} />
                          <ActionButton action={deleteSheet} fields={{ id: s.id }} label={`Delete ${s.title}`} icon="trash" onlyIcon confirm={`Delete "${s.title}"? This cannot be undone.`} />
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((s) => (
                <div key={s.id} className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4 transition-colors hover:border-brand/60">
                  <Link href={`/sheets/${s.id}`} className="flex items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-success/15 text-success">
                      <Icon name="grid" className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{s.title}</span>
                      <span className="block text-xs text-muted">
                        {s.cells} filled cell{s.cells === 1 ? "" : "s"}
                      </span>
                    </span>
                  </Link>
                  <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-3">
                    <span className="flex min-w-0 items-center gap-2 text-xs text-muted">
                      <Avatar name={s.editor ?? "?"} size="sm" />
                      <span className="truncate">Edited {relTime(s.updatedAt)}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <ButtonLink href={`/sheets/${s.id}`} variant="secondary" className="px-3 py-1.5 text-xs">
                        Open
                      </ButtonLink>
                      {canWrite ? (
                        <>
                          <RenameSheetButton sheetId={s.id} title={s.title} />
                          <ActionButton action={deleteSheet} fields={{ id: s.id }} label={`Delete ${s.title}`} icon="trash" onlyIcon confirm={`Delete "${s.title}"? This cannot be undone.`} />
                        </>
                      ) : null}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
