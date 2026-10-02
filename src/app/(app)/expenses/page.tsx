import type { Metadata } from "next";
import { pageContext, orgMembers } from "@/lib/page";
import { prisma } from "@/lib/db";
import { inr, fmtDate, sp } from "@/lib/format";
import { Badge } from "@/components/ui";
import { PageHeader, KpiGrid, KpiTile, Panel, PillTabs, EmptyPanel, ProgressBar } from "@/components/kit";
import { SearchInput, ParamSelect, ActionButton } from "@/components/kit-client";
import { Icon } from "@/components/kit-icons";
import { LogExpenseButton } from "@/components/finance/expense-modal";
import { EXPENSE_CATEGORIES } from "@/components/finance/constants";
import { monthKey, monthLabel, monthRange, monthStart } from "@/components/finance/money";
import { createExpense, deleteExpense } from "@/app/actions/expenses";

export const metadata: Metadata = { title: "Expenses", robots: { index: false } };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { orgId, canWrite } = await pageContext("invoice:write");
  const params = await searchParams;
  const month = sp(params.month);
  const range = monthRange(month);
  const category = sp(params.category);
  const projectFilter = sp(params.project);
  const q = sp(params.q).trim();

  const now = new Date();
  const mStart = monthStart(now);
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const key = monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1));
    return { value: key, label: monthLabel(key) };
  });

  const [rows, thisMonth, projects, members] = await Promise.all([
    prisma.expense.findMany({
      where: {
        orgId,
        ...(range ? { spentOn: { gte: range[0], lt: range[1] } } : {}),
        ...(category ? { category } : {}),
        ...(projectFilter ? { projectId: projectFilter } : {}),
        ...(q ? { description: { contains: q, mode: "insensitive" as const } } : {}),
      },
      orderBy: [{ spentOn: "desc" }, { createdAt: "desc" }],
      take: 500,
      include: { project: { select: { name: true } } },
    }),
    prisma.expense.findMany({ where: { orgId, spentOn: { gte: mStart } }, select: { category: true, amountMinor: true, gstDeductible: true } }),
    prisma.project.findMany({ where: { orgId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    orgMembers(orgId),
  ]);
  const names = new Map(members.map((m) => [m.id, m.name ?? m.email ?? "Member"]));

  const monthTotal = thisMonth.reduce((s, e) => s + e.amountMinor, 0);
  const deductible = thisMonth.filter((e) => e.gstDeductible).reduce((s, e) => s + e.amountMinor, 0);
  const catTotals = new Map<string, number>();
  for (const e of thisMonth) catTotals.set(e.category, (catTotals.get(e.category) ?? 0) + e.amountMinor);
  const top = [...catTotals.entries()].sort((a, b) => b[1] - a[1])[0];

  const shownTotal = rows.reduce((s, e) => s + e.amountMinor, 0);
  const breakdown = new Map<string, number>();
  for (const e of rows) breakdown.set(e.category, (breakdown.get(e.category) ?? 0) + e.amountMinor);
  const bars = [...breakdown.entries()].sort((a, b) => b[1] - a[1]);
  const filtered = Boolean(range || category || projectFilter || q);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Expenses"
        subtitle="Track business spend, tag GST-deductible items and see where money goes."
        actions={canWrite ? <LogExpenseButton action={createExpense} projects={projects} /> : undefined}
      />
      <div className="mb-5">
        <PillTabs
          items={[
            { href: "/finance", label: "Overview", active: false },
            { href: "/invoices", label: "Invoices", active: false },
            { href: "/expenses", label: "Expenses", active: true },
          ]}
        />
      </div>

      <KpiGrid cols={4}>
        <KpiTile label="Spent this month" value={inr(monthTotal)} hint={`${thisMonth.length} entr${thisMonth.length === 1 ? "y" : "ies"}`} icon="wallet" tone="danger" />
        <KpiTile label="Top category" value={top ? top[0] : "—"} hint={top ? inr(top[1]) : "Nothing logged this month"} icon="chart" tone="brand" />
        <KpiTile label="GST deductible" value={inr(deductible)} hint="this month" icon="receipt" tone="success" />
        <KpiTile label={filtered ? "In this view" : "Listed"} value={inr(shownTotal)} hint={`${rows.length} expense${rows.length === 1 ? "" : "s"}`} icon="list" />
      </KpiGrid>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput param="q" placeholder="Search expenses" className="w-full sm:w-64" />
        <ParamSelect param="month" allLabel="All months" options={monthOptions} />
        <ParamSelect param="category" allLabel="All categories" options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c }))} />
        <ParamSelect param="project" allLabel="All projects" options={projects.map((p) => ({ value: p.id, label: p.name }))} />
      </div>

      {rows.length === 0 ? (
        <EmptyPanel
          icon="receipt"
          title={filtered ? "No expenses match" : "No expenses logged yet"}
          hint={filtered ? "Change or clear the filters." : "Log your first expense to start tracking spend."}
          action={canWrite && !filtered ? <LogExpenseButton action={createExpense} projects={projects} /> : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_18rem]">
          <div className="overflow-x-auto rounded-[var(--radius-card)] border border-border bg-surface">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2/60 text-xs uppercase tracking-wider text-muted">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Project</th>
                  <th className="px-4 py-3 font-medium">GST</th>
                  <th className="px-4 py-3 font-medium">Logged by</th>
                  <th className="px-2 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((e) => (
                  <tr key={e.id} className="hover:bg-surface-2/40">
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{fmtDate(e.spentOn)}</td>
                    <td className="px-4 py-3">{e.category}</td>
                    <td className="max-w-xs px-4 py-3">
                      <span className="line-clamp-2">{e.description}</span>
                      {e.receiptUrl ? (
                        <a href={e.receiptUrl} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-xs text-brand hover:underline">
                          <Icon name="link" className="h-3 w-3" />
                          Receipt
                        </a>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{inr(e.amountMinor)}</td>
                    <td className="px-4 py-3 text-muted">{e.project?.name ?? "—"}</td>
                    <td className="px-4 py-3">{e.gstDeductible ? <Badge tone="success">Deductible</Badge> : <span className="text-muted">—</span>}</td>
                    <td className="px-4 py-3 text-muted">{e.loggedById ? (names.get(e.loggedById) ?? "—") : "—"}</td>
                    <td className="px-2 py-3 text-right">
                      {canWrite ? <ActionButton action={deleteExpense} fields={{ id: e.id }} label="Delete expense" icon="trash" onlyIcon confirm="Delete this expense?" /> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Panel title="By category" action={<span className="text-xs text-muted">{inr(shownTotal)}</span>}>
            <ul className="flex flex-col gap-3">
              {bars.map(([cat, amt]) => (
                <li key={cat}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="truncate pr-2">{cat}</span>
                    <span className="tabular-nums text-muted">{inr(amt)}</span>
                  </div>
                  <ProgressBar value={amt} max={Math.max(1, bars[0][1])} />
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}
    </div>
  );
}
