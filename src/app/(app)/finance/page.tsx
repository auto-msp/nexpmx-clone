import type { Metadata } from "next";
import Link from "next/link";
import { pageContext } from "@/lib/page";
import { prisma } from "@/lib/db";
import { inr, fmtDate } from "@/lib/format";
import { ButtonLink } from "@/components/ui";
import { PageHeader, KpiGrid, KpiTile, Panel, PillTabs, StatusBadge, EmptyPanel } from "@/components/kit";
import { Icon } from "@/components/kit-icons";
import { LogExpenseButton } from "@/components/finance/expense-modal";
import { createExpense } from "@/app/actions/expenses";
import { effectiveInvoiceStatus, monthKey, monthLabel, monthStart, totalsForInvoice } from "@/components/finance/money";

export const metadata: Metadata = { title: "Finance", robots: { index: false } };

export default async function FinancePage() {
  const { orgId, canWrite } = await pageContext("invoice:write");
  const now = new Date();
  const mStart = monthStart(now);
  const sixStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const [org, invoices, expenses, projects] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId }, select: { state: true } }),
    prisma.invoice.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        number: true,
        amountMinor: true,
        gstRateBps: true,
        interstate: true,
        placeOfSupply: true,
        status: true,
        issuedAt: true,
        dueAt: true,
        createdAt: true,
        updatedAt: true,
        client: { select: { name: true } },
        lines: { select: { quantity: true, rateMinor: true, gstBps: true } },
      },
    }),
    prisma.expense.findMany({ where: { orgId, spentOn: { gte: sixStart } }, orderBy: { spentOn: "desc" } }),
    prisma.project.findMany({ where: { orgId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const rows = invoices.map((inv) => ({ inv, tot: totalsForInvoice(inv, org?.state), eff: effectiveInvoiceStatus(inv.status, inv.dueAt, now) }));
  const sumGross = (list: typeof rows) => list.reduce((s, r) => s + r.tot.grossMinor, 0);
  const paid = rows.filter((r) => r.inv.status === "PAID");
  const paidThisMonth = paid.filter((r) => r.inv.updatedAt >= mStart);
  const issuedThisMonth = rows.filter((r) => r.inv.status !== "DRAFT" && (r.inv.issuedAt ?? r.inv.createdAt) >= mStart);
  const outstanding = rows.filter((r) => ["SENT", "OVERDUE"].includes(r.inv.status));
  const overdue = rows.filter((r) => r.eff === "OVERDUE");
  const sentOnly = rows.filter((r) => r.eff === "SENT");
  const drafts = rows.filter((r) => r.inv.status === "DRAFT");

  const expThisMonth = expenses.filter((e) => e.spentOn >= mStart);
  const expTotal = expThisMonth.reduce((s, e) => s + e.amountMinor, 0);
  const collected = sumGross(paidThisMonth);
  const net = collected - expTotal;

  const months = Array.from({ length: 6 }, (_, i) => new Date(now.getFullYear(), now.getMonth() - 5 + i, 1));
  const chart = months.map((m) => {
    const key = monthKey(m);
    return {
      key,
      cashIn: sumGross(paid.filter((r) => monthKey(r.inv.updatedAt) === key)),
      cashOut: expenses.filter((e) => monthKey(e.spentOn) === key).reduce((s, e) => s + e.amountMinor, 0),
    };
  });
  const chartMax = Math.max(1, ...chart.flatMap((c) => [c.cashIn, c.cashOut]));

  const gst = issuedThisMonth.reduce(
    (a, r) => ({ cgst: a.cgst + r.tot.cgstMinor, sgst: a.sgst + r.tot.sgstMinor, igst: a.igst + r.tot.igstMinor }),
    { cgst: 0, sgst: 0, igst: 0 },
  );
  const gstTotal = gst.cgst + gst.sgst + gst.igst;

  const pipeline = [
    { label: "Draft", list: drafts, tone: "text-muted", bar: "bg-muted" },
    { label: "Sent", list: sentOnly, tone: "text-brand", bar: "bg-brand" },
    { label: "Overdue", list: overdue, tone: "text-danger", bar: "bg-danger" },
    { label: "Paid this month", list: paidThisMonth, tone: "text-success", bar: "bg-success" },
  ];

  const recentInvoices = rows.slice(0, 5);
  const recentExpenses = expenses.slice(0, 5);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Finance"
        subtitle="Invoices, collections, expenses and GST at a glance."
        actions={
          canWrite ? (
            <>
              <LogExpenseButton action={createExpense} projects={projects} variant="secondary" />
              <ButtonLink href="/invoices/new">
                <Icon name="plus" />
                New invoice
              </ButtonLink>
            </>
          ) : undefined
        }
      />
      <div className="mb-5">
        <PillTabs
          items={[
            { href: "/finance", label: "Overview", active: true },
            { href: "/invoices", label: "Invoices", active: false },
            { href: "/expenses", label: "Expenses", active: false },
          ]}
        />
      </div>

      <KpiGrid cols={6}>
        <KpiTile label="Collected" value={inr(collected)} hint={`this month · ${inr(sumGross(paid))} all time`} icon="wallet" tone="success" />
        <KpiTile label="Invoiced" value={inr(sumGross(issuedThisMonth))} hint={`${issuedThisMonth.length} this month`} icon="receipt" tone="brand" />
        <KpiTile label="Outstanding" value={inr(sumGross(outstanding))} hint={`${outstanding.length} unpaid`} icon="clock" tone="warn" href="/invoices?status=sent" />
        <KpiTile label="Overdue" value={inr(sumGross(overdue))} hint={`${overdue.length} past due`} icon="alert" tone={overdue.length ? "danger" : "neutral"} href="/invoices?status=overdue" />
        <KpiTile label="Expenses" value={inr(expTotal)} hint="this month" icon="file" tone="danger" href="/expenses" />
        <KpiTile label="Net" value={inr(net)} hint="collected − expenses, this month" icon="chart" tone={net >= 0 ? "success" : "danger"} />
      </KpiGrid>

      <Panel title="Invoice pipeline" className="mb-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {pipeline.map((s, i) => (
            <div key={s.label} className="relative rounded-[var(--radius-control)] border border-border bg-surface-2 p-4">
              <span className={`absolute inset-x-0 top-0 h-0.5 rounded-t ${s.bar}`} aria-hidden />
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{s.label}</span>
                {i < pipeline.length - 1 ? <Icon name="chevronRight" className="hidden h-3.5 w-3.5 text-muted lg:block" /> : null}
              </div>
              <div className={`mt-1 text-2xl font-semibold tabular-nums ${s.tone}`}>{s.list.length}</div>
              <div className="text-sm text-muted tabular-nums">{inr(sumGross(s.list))}</div>
            </div>
          ))}
        </div>
      </Panel>

      <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-[3fr_2fr]">
        <Panel title="Cash in vs cash out" action={<span className="text-xs text-muted">Last 6 months</span>}>
          <figure>
            <div className="flex h-44 items-end gap-2 sm:gap-4" role="img" aria-label={`Cash in versus cash out. ${chart.map((c) => `${monthLabel(c.key)}: in ${inr(c.cashIn)}, out ${inr(c.cashOut)}`).join("; ")}`}>
              {chart.map((c) => (
                <div key={c.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <div className="flex h-full w-full items-end justify-center gap-1">
                    <div className="w-3 rounded-t bg-success sm:w-5" style={{ height: `${c.cashIn ? Math.max(3, (c.cashIn / chartMax) * 100) : 0}%` }} title={`Cash in ${inr(c.cashIn)}`} />
                    <div className="w-3 rounded-t bg-danger sm:w-5" style={{ height: `${c.cashOut ? Math.max(3, (c.cashOut / chartMax) * 100) : 0}%` }} title={`Cash out ${inr(c.cashOut)}`} />
                  </div>
                  <span className="text-[10px] text-muted">{monthLabel(c.key).split(" ")[0]}</span>
                </div>
              ))}
            </div>
            <figcaption className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-success" />Cash in (paid invoices)</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-danger" />Cash out (expenses)</span>
            </figcaption>
          </figure>
        </Panel>

        <Panel title="GST summary" action={<span className="text-xs text-muted">Output tax, invoiced this month</span>}>
          {gstTotal === 0 ? (
            <p className="text-sm text-muted">No GST on invoices issued this month.</p>
          ) : (
            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between"><dt className="text-muted">CGST</dt><dd className="tabular-nums">{inr(gst.cgst)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">SGST</dt><dd className="tabular-nums">{inr(gst.sgst)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">IGST</dt><dd className="tabular-nums">{inr(gst.igst)}</dd></div>
              <div className="flex justify-between border-t border-border pt-2 font-semibold"><dt>Total output tax</dt><dd className="tabular-nums">{inr(gstTotal)}</dd></div>
            </dl>
          )}
          <p className="mt-3 text-xs text-muted">Input credit on GST-deductible expenses is tracked on the Expenses page.</p>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title="Recent invoices" flush action={<Link href="/invoices" className="text-xs text-brand hover:underline">View all</Link>}>
          {recentInvoices.length === 0 ? (
            <div className="p-5">
              <EmptyPanel icon="receipt" title="No invoices yet" hint="Create your first invoice to start tracking collections." action={canWrite ? <ButtonLink href="/invoices/new">New invoice</ButtonLink> : undefined} />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {recentInvoices.map(({ inv, tot, eff }) => (
                <li key={inv.id}>
                  <Link href={`/invoices/${inv.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{inv.number}</div>
                      <div className="truncate text-xs text-muted">{inv.client.name} · due {fmtDate(inv.dueAt)}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <StatusBadge status={eff} />
                      <span className="w-24 text-right text-sm tabular-nums">{inr(tot.grossMinor)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Recent expenses" flush action={<Link href="/expenses" className="text-xs text-brand hover:underline">View all</Link>}>
          {recentExpenses.length === 0 ? (
            <div className="p-5">
              <EmptyPanel icon="wallet" title="No expenses logged" hint="Log spend as it happens to keep your net figure honest." />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {recentExpenses.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{e.description}</div>
                    <div className="truncate text-xs text-muted">{e.category} · {fmtDate(e.spentOn)}</div>
                  </div>
                  <span className="shrink-0 text-sm tabular-nums">{inr(e.amountMinor)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
