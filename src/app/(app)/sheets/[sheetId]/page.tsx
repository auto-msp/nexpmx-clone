import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getOrgContext } from "@/lib/tenancy";
import { prisma } from "@/lib/db";
import { canRead } from "@/lib/rbac";
import { SheetGrid } from "@/components/sheet-grid";
import { saveSheetCells, renameSheet } from "@/app/actions/sheets";
import type { Cells } from "@/lib/sheets";

export const metadata: Metadata = { title: "Sheet", robots: { index: false } };

export default async function SheetPage({
  params,
}: {
  params: Promise<{ sheetId: string }>;
}) {
  const { sheetId } = await params;
  const session = await auth();
  const ctx = await getOrgContext(session!.user!.id);
  if (!canRead(ctx!.role)) throw new Error("Forbidden");

  const sheet = await prisma.sheet.findFirst({
    where: { id: sheetId, orgId: ctx!.orgId },
  });
  if (!sheet) notFound();

  const cells: Cells = JSON.parse(sheet.cellsJson) as Cells;

  async function save(fd: FormData) {
    "use server";
    await saveSheetCells(fd);
  }
  async function rename(fd: FormData) {
    "use server";
    await renameSheet(fd);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/sheets" className="text-xs text-muted hover:text-brand">
          ← All sheets
        </Link>
      </div>

      <form action={rename} className="flex max-w-md items-end gap-2">
        <input type="hidden" name="id" value={sheet.id} />
        <label className="flex-1 text-xs text-muted">
          Title
          <input
            name="title"
            defaultValue={sheet.title}
            maxLength={120}
            className="mt-1 w-full rounded-[var(--radius-control)] border border-border bg-surface-2 px-3 py-1.5 text-sm text-text focus:border-brand focus:outline-none"
          />
        </label>
        <button
          type="submit"
          className="rounded-[var(--radius-control)] border border-border px-3 py-1.5 text-xs text-muted hover:border-brand hover:text-text"
        >
          Rename
        </button>
      </form>

      <SheetGrid
        sheetId={sheet.id}
        title={sheet.title}
        initialCells={cells}
        saveAction={save}
      />
    </div>
  );
}
