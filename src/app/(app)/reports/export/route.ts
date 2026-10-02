import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getOrgContext } from "@/lib/tenancy";
import { canRead } from "@/lib/rbac";
import { invoiceGross, istKey } from "@/components/home/dates";
import { loadReport, parsePeriod } from "@/components/home/report-queries";

export const dynamic = "force-dynamic";

/** Spreadsheet formula injection guard + RFC 4180 quoting. */
function cell(v: string | number | null | undefined): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && typeof v === "string") s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function csv(rows: Array<Array<string | number | null | undefined>>): string {
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
const rupees = (minor: number) => Math.round(minor) / 100;

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const ctx = await getOrgContext(session.user.id);
  if (!ctx || !canRead(ctx.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const period = parsePeriod(url.searchParams.get("period") ?? "");
  const table = url.searchParams.get("table") ?? "invoices";
  const orgId = ctx.orgId;
  const report = await loadReport(orgId, period);
  const range = { gte: report.start, lt: report.end };

  let rows: Array<Array<string | number | null | undefined>>;
  switch (table) {
    case "team":
      rows = [
        ["Member", "Designation", "Open tasks", "Completed in period", "Overdue", "Planned hours (week)", "Weekly capacity (h)", "Utilisation %"],
        ...report.team.map((m) => [m.name, m.designation, m.openTasks, m.completed, m.overdue, m.plannedHours, m.capacityHours, m.utilisation ?? ""]),
      ];
      break;
    case "clients":
      rows = [["Client", "Paid invoices", "Collected (INR, incl. GST)"], ...report.clients.map((c) => [c.name, c.invoices, rupees(c.collected)])];
      break;
    case "expenses": {
      const expenses = await prisma.expense.findMany({ where: { orgId, spentOn: range }, orderBy: { spentOn: "asc" }, take: 5000 });
      rows = [
        ["Date", "Category", "Description", "Amount (INR)", "GST deductible"],
        ...expenses.map((e) => [istKey(e.spentOn), e.category, e.description, rupees(e.amountMinor), e.gstDeductible ? "Yes" : "No"]),
      ];
      break;
    }
    case "invoices": {
      const invoices = await prisma.invoice.findMany({
        where: { orgId, OR: [{ issuedAt: range }, { issuedAt: null, createdAt: range }] },
        orderBy: { createdAt: "asc" },
        take: 5000,
        include: { client: { select: { name: true } } },
      });
      rows = [
        ["Number", "Client", "Status", "Issued", "Due", "Net (INR)", "GST %", "Total (INR)"],
        ...invoices.map((i) => [
          i.number,
          i.client.name,
          i.status,
          i.issuedAt ? istKey(i.issuedAt) : "",
          i.dueAt ? i.dueAt.toISOString().slice(0, 10) : "",
          rupees(i.amountMinor),
          i.gstRateBps / 100,
          rupees(invoiceGross(i)),
        ]),
      ];
      break;
    }
    default:
      return NextResponse.json({ error: "Unknown table" }, { status: 400 });
  }

  return new NextResponse(csv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bizmemory-${table}-${period}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
