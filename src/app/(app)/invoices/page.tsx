import type { Metadata } from "next";
import Link from "next/link";
import { pageContext } from "@/lib/page";
import { prisma } from "@/lib/db";
import { inr, fmtDate, sp } from "@/lib/format";
import { ButtonLink } from "@/components/ui";
import { PageHeader, TabLinks, StatusBadge, EmptyPanel, PillTabs } from "@/components/kit";
import { SearchInput, ParamSelect, ActionButton } from "@/components/kit-client";
import { Icon } from "@/components/kit-icons";
import { MiniLink } from "@/components/finance/mini-link";
import { INVOICE_STATUSES } from "@/components/finance/constants";
import { effectiveInvoiceStatus, totalsForInvoice } from "@/components/finance/money";
import { transitionInvoice, deleteInvoice } from "@/app/actions/invoices";

export const metadata: Metadata = { title: "Invoices", robots: { index: false } };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { orgId, canWrite } = await pageContext("invoice:write");
  const params = await searchParams;
  const status = sp(params.status).toUpperCase();
  const activeStatus = (INVOICE_STATUSES as readonly string[]).includes(status) ? status : "";
  const q = sp(params.q).trim().toLowerCase();
  const clientFilter = sp(params.client);

  const [org, invoices, clients] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId }, select: { state: true } }),
    prisma.invoice.findMany({
      where: { orgId },
      orderBy: [{ createdAt: "desc" }],
      include: { client: { select: { id: true, name: true } }, lines: { select: { quantity: true, rateMinor: true, gstBps: true } } },
    }),
    prisma.client.findMany({ where: { orgId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const now = new Date();
  const all = invoices.map((inv) => ({ inv, tot: totalsForInvoice(inv, org?.state), eff: effectiveInvoiceStatus(inv.status, inv.dueAt, now) }));
  const visible = all.filter(
    (r) =>
      (!activeStatus || r.eff === activeStatus) &&
      (!clientFilter || r.inv.clientId === clientFilter) &&
      (!q || r.inv.number.toLowerCase().includes(q) || r.inv.client.name.toLowerCase().includes(q)),
  );
  const totalShown = visible.reduce((s, r) => s + r.tot.grossMinor, 0);
  const taxShown = visible.reduce((s, r) => s + r.tot.taxMinor, 0);

  const href = (s: string) => {
    const u = new URLSearchParams();
    if (s) u.set("status", s.toLowerCase());
    if (q) u.set("q", q);
    if (clientFilter) u.set("client", clientFilter);
    const qs = u.toString();
    return qs ? `/invoices?${qs}` : "/invoices";
  };
  const tabs = [
    { href: href(""), label: "All", active: !activeStatus, count: all.length },
    ...INVOICE_STATUSES.map((s) => ({
      href: href(s),
      label: s.charAt(0) + s.slice(1).toLowerCase(),
      active: activeStatus === s,
      count: all.filter((r) => r.eff === s).length,
    })),
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Invoices"
        subtitle="Every invoice you have raised, with GST and payment status."
        actions={canWrite ? <ButtonLink href="/invoices/new"><Icon name="plus" />New invoice</ButtonLink> : undefined}
      />
      <div className="mb-5">
        <PillTabs
          items={[
            { href: "/finance", label: "Overview", active: false },
            { href: "/invoices", label: "Invoices", active: true },
            { href: "/expenses", label: "Expenses", active: false },
          ]}
        />
      </div>

      <TabLinks tabs={tabs} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput param="q" placeholder="Search number or client" className="w-full sm:w-72" />
        <ParamSelect param="client" allLabel="All clients" options={clients.map((c) => ({ value: c.id, label: c.name }))} />
      </div>

      {all.length === 0 ? (
        <EmptyPanel icon="receipt" title="No invoices yet" hint="Create an invoice for a client and send it when you are ready." action={canWrite ? <ButtonLink href="/invoices/new">New invoice</ButtonLink> : undefined} />
      ) : visible.length === 0 ? (
        <EmptyPanel icon="search" title="No invoices match" hint="Change the status tab, client or search." />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-border bg-surface">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2/60 text-xs uppercase tracking-wider text-muted">
                <th className="px-4 py-3 font-medium">Number</th>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Issued</th>
                <th className="px-4 py-3 font-medium">Due</th>
                <th className="px-4 py-3 text-right font-medium">Amount (incl. GST)</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.map(({ inv, tot, eff }) => (
                <tr key={inv.id} className="hover:bg-surface-2/40">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/invoices/${inv.id}`} className="hover:text-brand">{inv.number}</Link>
                  </td>
                  <td className="px-4 py-3">{inv.client.name}</td>
                  <td className="px-4 py-3 text-muted">{fmtDate(inv.issuedAt)}</td>
                  <td className={`px-4 py-3 ${eff === "OVERDUE" ? "text-danger" : "text-muted"}`}>{fmtDate(inv.dueAt)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{inr(tot.grossMinor)}</td>
                  <td className="px-4 py-3"><StatusBadge status={eff} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <MiniLink href={`/invoices/${inv.id}`} icon="eye" label="View" />
                      {canWrite && inv.status === "DRAFT" ? <ActionButton action={transitionInvoice} fields={{ id: inv.id, status: "SENT" }} label="Mark sent" icon="send" /> : null}
                      {canWrite && ["SENT", "OVERDUE"].includes(inv.status) ? <ActionButton action={transitionInvoice} fields={{ id: inv.id, status: "PAID" }} label="Mark paid" icon="check" confirm={`Mark ${inv.number} as paid?`} /> : null}
                      {canWrite && inv.status === "DRAFT" ? <ActionButton action={deleteInvoice} fields={{ id: inv.id }} label="Delete draft" icon="trash" onlyIcon confirm={`Delete draft ${inv.number}?`} /> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-surface-2/60 font-semibold">
                <td className="px-4 py-3" colSpan={4}>
                  {visible.length} invoice{visible.length === 1 ? "" : "s"} <span className="font-normal text-muted">· GST {inr(taxShown)}</span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{inr(totalShown)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
