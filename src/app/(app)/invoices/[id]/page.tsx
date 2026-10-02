import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { pageContext, orgMembers } from "@/lib/page";
import { prisma } from "@/lib/db";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { formatPaise, gstRateLabel, upiPaymentLink } from "@/lib/gst";
import { nextActionsFor } from "@/lib/invoice-state";
import { PageHeader, Panel, StatusBadge } from "@/components/kit";
import { ActionButton, CopyButton } from "@/components/kit-client";
import { Icon } from "@/components/kit-icons";
import { PrintButton } from "@/components/finance/print-button";
import { PrintStyles } from "@/components/finance/print-styles";
import { effectiveInvoiceStatus, lineNet, totalsForInvoice } from "@/components/finance/money";
import { transitionInvoice, deleteInvoice } from "@/app/actions/invoices";

export const metadata: Metadata = { title: "Invoice", robots: { index: false } };

const ACTION_LABEL: Record<string, string> = {
  "invoice.created": "Created",
  "invoice.status_changed": "Status changed",
  "invoice.created_from_proposal": "Created from proposal",
};

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId, canWrite } = await pageContext("invoice:write");
  const inv = await prisma.invoice.findFirst({
    where: { id, orgId },
    include: { client: true, lines: { orderBy: { position: "asc" } } },
  });
  if (!inv) notFound();

  const [org, project, history, members] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true, gstin: true, addressLine: true, city: true, state: true, postalCode: true, country: true, upiId: true, upiPayeeName: true },
    }),
    inv.projectId ? prisma.project.findFirst({ where: { id: inv.projectId, orgId }, select: { id: true, name: true } }) : Promise.resolve(null),
    prisma.auditLog.findMany({ where: { orgId, entity: "Invoice", entityId: id }, orderBy: { createdAt: "desc" }, take: 20 }),
    orgMembers(orgId),
  ]);
  const names = new Map(members.map((m) => [m.id, m.name ?? m.email ?? "Member"]));

  const tot = totalsForInvoice(inv, org?.state);
  const eff = effectiveInvoiceStatus(inv.status, inv.dueAt);
  const displayLines =
    inv.lines.length > 0
      ? inv.lines.map((l) => ({ description: l.description, quantity: l.quantity, unit: l.unit, rateMinor: l.rateMinor, gstBps: l.gstBps }))
      : [{ description: "Professional services", quantity: 1, unit: "Piece", rateMinor: inv.amountMinor, gstBps: inv.gstRateBps }];

  const upi =
    org?.upiId && inv.status !== "PAID"
      ? upiPaymentLink({ vpa: org.upiId, payeeName: org.upiPayeeName ?? org.name, amountMinor: tot.grossMinor, note: inv.number })
      : null;

  const actions = nextActionsFor(inv.status).filter((a) => a.to !== "OVERDUE");
  const sellerAddress = [org?.addressLine, [org?.city, org?.postalCode].filter(Boolean).join(" "), org?.state, org?.country].filter(Boolean).join(", ");
  const buyerAddress = [inv.client.billingAddress, [inv.client.city, inv.client.pincode].filter(Boolean).join(" "), inv.client.state].filter(Boolean).join(", ");

  return (
    <div className="mx-auto max-w-7xl">
      <PrintStyles />
      <PageHeader
        title={inv.number}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge status={eff} />
            <span>{inv.client.name}</span>
          </span>
        }
        back={{ href: "/invoices", label: "All invoices" }}
        actions={
          <div className="no-print flex flex-wrap items-center gap-2">
            {canWrite
              ? actions.map((a) => (
                  <ActionButton
                    key={a.to}
                    action={transitionInvoice}
                    fields={{ id: inv.id, status: a.to }}
                    label={a.to === "SENT" ? "Mark as sent" : a.label}
                    icon={a.to === "PAID" ? "check" : "send"}
                    variant="primary"
                    confirm={a.to === "PAID" ? `Mark ${inv.number} as paid?` : undefined}
                  />
                ))
              : null}
            <PrintButton />
            {canWrite && inv.status === "DRAFT" ? (
              <ActionButton action={deleteInvoice} fields={{ id: inv.id }} label="Delete draft" icon="trash" variant="danger" confirm={`Delete draft ${inv.number}?`} />
            ) : null}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_20rem]">
        <article className="print-doc rounded-[var(--radius-card)] border border-border bg-surface p-6 sm:p-8">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
            <div>
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">{org?.gstin ? "Tax invoice" : "Invoice"}</div>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight">{inv.number}</h2>
            </div>
            <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted">Issued</dt>
              <dd className="text-right">{fmtDate(inv.issuedAt ?? inv.createdAt)}</dd>
              <dt className="text-muted">Due</dt>
              <dd className="text-right">{fmtDate(inv.dueAt)}</dd>
              {inv.placeOfSupply ? (
                <>
                  <dt className="text-muted">Place of supply</dt>
                  <dd className="text-right">{inv.placeOfSupply}</dd>
                </>
              ) : null}
              {project ? (
                <>
                  <dt className="text-muted">Project</dt>
                  <dd className="text-right">{project.name}</dd>
                </>
              ) : null}
            </dl>
          </header>

          <section className="grid grid-cols-1 gap-5 border-b border-border py-5 text-sm sm:grid-cols-2">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">From</div>
              <div className="mt-1 font-medium">{org?.name}</div>
              {sellerAddress ? <div className="text-muted">{sellerAddress}</div> : null}
              {inv.gstinSnapshot || org?.gstin ? <div className="text-muted">GSTIN {inv.gstinSnapshot ?? org?.gstin}</div> : null}
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Bill to</div>
              <div className="mt-1 font-medium">{inv.client.name}</div>
              {inv.client.company ? <div className="text-muted">{inv.client.company}</div> : null}
              {buyerAddress ? <div className="text-muted">{buyerAddress}</div> : null}
              {inv.client.gstin ? <div className="text-muted">GSTIN {inv.client.gstin}</div> : null}
              {inv.client.email ? <div className="text-muted">{inv.client.email}</div> : null}
            </div>
          </section>

          <section className="overflow-x-auto py-5">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted">
                  <th className="py-2 pr-2 font-medium">#</th>
                  <th className="px-2 py-2 font-medium">Description</th>
                  <th className="px-2 py-2 text-right font-medium">Qty</th>
                  <th className="px-2 py-2 text-right font-medium">Rate</th>
                  <th className="px-2 py-2 text-right font-medium">GST</th>
                  <th className="py-2 pl-2 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {displayLines.map((l, i) => (
                  <tr key={i}>
                    <td className="py-2 pr-2 text-muted">{i + 1}</td>
                    <td className="px-2 py-2">{l.description}</td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {l.quantity} <span className="text-muted">{l.unit}</span>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{formatPaise(l.rateMinor)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{gstRateLabel(l.gstBps)}</td>
                    <td className="py-2 pl-2 text-right tabular-nums">{formatPaise(lineNet(l))}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <dl className="mt-4 ml-auto flex w-full max-w-xs flex-col gap-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd className="tabular-nums">{formatPaise(tot.netMinor)}</dd></div>
              {tot.interstate ? (
                <div className="flex justify-between"><dt className="text-muted">IGST</dt><dd className="tabular-nums">{formatPaise(tot.igstMinor)}</dd></div>
              ) : (
                <>
                  <div className="flex justify-between"><dt className="text-muted">CGST</dt><dd className="tabular-nums">{formatPaise(tot.cgstMinor)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted">SGST</dt><dd className="tabular-nums">{formatPaise(tot.sgstMinor)}</dd></div>
                </>
              )}
              <div className="flex justify-between border-t border-border pt-2 text-base font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatPaise(tot.grossMinor)}</dd></div>
            </dl>
          </section>

          {inv.notes || inv.terms || inv.bankDetails ? (
            <section className="grid grid-cols-1 gap-4 border-t border-border pt-5 text-sm sm:grid-cols-2">
              {inv.notes ? (
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Notes</div>
                  <p className="mt-1 whitespace-pre-wrap">{inv.notes}</p>
                </div>
              ) : null}
              {inv.terms ? (
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Terms</div>
                  <p className="mt-1 whitespace-pre-wrap">{inv.terms}</p>
                </div>
              ) : null}
              {inv.bankDetails ? (
                <div className="sm:col-span-2">
                  <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Bank details</div>
                  <p className="mt-1 whitespace-pre-wrap">{inv.bankDetails}</p>
                </div>
              ) : null}
            </section>
          ) : null}
        </article>

        <aside className="no-print flex flex-col gap-4">
          <Panel title="Payment">
            <div className="text-sm">
              <div className="text-muted">Amount due</div>
              <div className="text-2xl font-semibold tabular-nums">{inv.status === "PAID" ? formatPaise(0) : formatPaise(tot.grossMinor)}</div>
              {inv.status === "PAID" ? <p className="mt-1 text-xs text-success">Paid in full</p> : null}
            </div>
            {upi ? (
              <div className="mt-4 flex flex-col gap-2">
                <a href={upi} className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-strong">
                  <Icon name="rupee" />
                  Pay via UPI
                </a>
                <CopyButton text={upi} label="Copy UPI link" />
              </div>
            ) : inv.status !== "PAID" && !org?.upiId ? (
              <p className="mt-3 text-xs text-muted">
                Add a UPI ID in <Link href="/settings" className="text-brand hover:underline">settings</Link> to show a payment link here.
              </p>
            ) : null}
          </Panel>

          <Panel title="Activity">
            {history.length === 0 ? (
              <p className="text-sm text-muted">No recorded activity yet.</p>
            ) : (
              <ol className="flex flex-col gap-3 text-sm">
                {history.map((h) => {
                  let detail = "";
                  try {
                    const m = JSON.parse(h.metaJson) as { from?: string; to?: string };
                    if (m.to) detail = ` · ${m.from ?? ""} → ${m.to}`;
                  } catch {
                    detail = "";
                  }
                  return (
                    <li key={h.id} className="flex flex-col">
                      <span className="font-medium">
                        {ACTION_LABEL[h.action] ?? h.action}
                        <span className="font-normal text-muted">{detail}</span>
                      </span>
                      <span className="text-xs text-muted">
                        {h.actorId ? (names.get(h.actorId) ?? "Member") : "System"} · {fmtDateTime(h.createdAt)}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </Panel>
        </aside>
      </div>
    </div>
  );
}
