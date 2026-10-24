import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { pageContext } from "@/lib/page";
import { fmtDateTime } from "@/lib/format";
import { PageHeader } from "@/components/kit";
import { SheetGrid } from "@/components/sheet-grid";
import { RenameSheetButton } from "@/components/docs/sheet-forms";
import { saveSheetCells } from "@/app/actions/sheets";
import type { Cells } from "@/lib/sheets";

export const metadata: Metadata = { title: "Sheet", robots: { index: false } };

export default async function SheetPage({ params }: { params: Promise<{ sheetId: string }> }) {
  const { sheetId } = await params;
  const { orgId, canWrite } = await pageContext("project:write");

  const sheet = await prisma.sheet.findFirst({ where: { id: sheetId, orgId } });
  if (!sheet) notFound();

  let cells: Cells = {};
  try {
    cells = JSON.parse(sheet.cellsJson) as Cells;
  } catch {
    cells = {};
  }

  async function save(fd: FormData) {
    "use server";
    await saveSheetCells(fd);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={sheet.title}
        back={{ href: "/sheets", label: "All sheets" }}
        subtitle={`Last saved ${fmtDateTime(sheet.updatedAt)}`}
        actions={canWrite ? <RenameSheetButton sheetId={sheet.id} title={sheet.title} variant="secondary" /> : null}
      />
      <SheetGrid sheetId={sheet.id} title={sheet.title} initialCells={cells} saveAction={save} />
    </div>
  );
}
