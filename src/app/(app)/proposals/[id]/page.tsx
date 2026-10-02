import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageContext, orgMembers } from "@/lib/page";
import { prisma } from "@/lib/db";
import { inr, fmtDate, fmtDateTime } from "@/lib/format";
import { sanitizeHtml } from "@/lib/sanitize";
import { PageHeader, Panel, StatusBadge, DetailRow } from "@/components/kit";
import { ActionButton } from "@/components/kit-client";
import { ButtonLink } from "@/components/ui";
import { Icon } from "@/components/kit-icons";
import { PrintButton } from "@/components/finance/print-button";
import { PrintStyles } from "@/components/finance/print-styles";
import { parseProposalItems, proposalItemsTotal, lineNet } from "@/components/finance/money";
import { markProposalSent, markProposalViewed, decideProposal, convertProposalToInvoice, duplicateProposal, deleteProposal } from "@/app/actions/proposals";

export const metadata: Metadata = { title: "Proposal", robots: { index: false } };

const ACTION_LABEL: Record<string, string> = {
  "proposal.created": "Created",
  "proposal.updated": "Edited",
  "proposal.sent": "Marked as sent",
  "proposal.viewed": "Marked as viewed",
  "proposal.accepted": "Accepted",
  "proposal.rejected": "Rejected",
  "invoice.created_from_proposal": "Invoice created",
};

export default async function ProposalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId, canWrite } = await pageContext("invoice:write");
  const p = await prisma.proposal.findFirst({ where: { id, orgId }, include: { client: true } });
  if (!p) notFound();

  const [org, history, members] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } }),
    prisma.auditLog.findMany({ where: { orgId, entity: "Proposal", entityId: id }, orderBy: { createdAt: "desc" }, take: 30 }),
    orgMembers(orgId),
  ]);
  const names = new Map(members.map((m) => [m.id, m.name ?? m.email ?? "Member"]));

  let invoiceId: string | null = null;
  const convLog = history.find((h) => h.action === "invoice.created_from_proposal");
  if (convLog) {
    try {
      const meta = JSON.parse(convLog.metaJson) as { invoiceId?: string };
      if (meta.invoiceId) {
        const inv = await prisma.invoice.findFirst({ where: { id: meta.invoiceId, orgId }, select: { id: true } });
        invoiceId = inv?.id ?? null;
      }
    } catch {
      invoiceId = null;
    }
  }

  const items = parseProposalItems(p.lineItemsJson);
  const total = items.length ? proposalItemsTotal(items) : p.amountMinor;
  const advance = Math.round((total * p.advancePct) / 100);
  const decided = ["ACCEPTED", "REJECTED"].includes(p.status);
  const expired = p.validUntil && p.validUntil.getTime() < Date.now() && !decided;

  return (
    <div className="mx-auto max-w-7xl">
      <PrintStyles />
      <PageHeader
        title={p.title}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge status={p.status} />
            <span>{p.client?.name ?? "No client"}</span>
          </span>
        }
        back={{ href: "/proposals", label: "All proposals" }}
        actions={
          <div className="no-print flex flex-wrap items-center gap-2">
            <PrintButton />
            {canWrite && !decided ? (
              <ButtonLink href={`/proposals/${p.id}/edit`} variant="secondary">
                <Icon name="edit" />
                Edit
              </ButtonLink>
            ) : null}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_20rem]">
        <article className="print-doc rounded-[var(--radius-card)] border border-border bg-surface p-6 sm:p-8">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
            <div>
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Proposal</div>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">{p.title}</h2>
              {p.summary ? <p className="mt-1 text-sm text-muted">{p.summary}</p> : null}
            </div>
            <div className="text-right text-sm">
              <div className="font-semibold">{org?.name}</div>
              <div className="text-muted">Prepared {fmtDate(p.sentAt ?? p.createdAt)}</div>
              {p.validUntil ? <div className={expired ? "text-warn" : "text-muted"}>Valid until {fmtDate(p.validUntil)}</div> : null}
            </div>
          </header>

          <section className="grid grid-cols-1 gap-4 border-b border-border py-5 text-sm sm:grid-cols-2">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Prepared for</div>
              <div className="mt-1 font-medium">{p.client?.name ?? "—"}</div>
              {p.client?.company ? <div className="text-muted">{p.client.company}</div> : null}
              {p.client?.email ? <div className="text-muted">{p.client.email}</div> : null}
            </div>
            <div className="sm:text-right">
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Investment</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">{inr(total)}</div>
              <div className="text-muted">{p.advancePct}% advance on acceptance · {inr(advance)}</div>
            </div>
          </section>

          {p.bodyHtml ? (
            <section
              className="py-5 text-sm leading-relaxed [&_a]:text-brand [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted [&_h1]:mb-2 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-6"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(p.bodyHtml) }}
            />
          ) : null}

          <section className="pt-5">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Scope and pricing</div>
            {items.length === 0 ? (
              <p className="text-sm text-muted">No line items. Total {inr(p.amountMinor)}.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted">
                      <th className="py-2 pr-3 font-medium">Deliverable</th>
                      <th className="px-3 py-2 text-right font-medium">Qty</th>
                      <th className="px-3 py-2 text-right font-medium">Rate</th>
                      <th className="py-2 pl-3 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {items.map((i, n) => (
                      <tr key={n}>
                        <td className="py-2 pr-3">{i.description}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{i.quantity}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{inr(i.rateMinor)}</td>
                        <td className="py-2 pl-3 text-right tabular-nums">{inr(lineNet(i))}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border font-semibold">
                      <td colSpan={3} className="py-2 pr-3 text-right">Total</td>
                      <td className="py-2 pl-3 text-right tabular-nums">{inr(total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>
        </article>

        <aside className="no-print flex flex-col gap-4">
          {canWrite ? (
            <Panel title="Actions">
              <div className="flex flex-col items-stretch gap-2">
                {p.status === "DRAFT" ? <ActionButton action={markProposalSent} fields={{ id: p.id }} label="Send to client" icon="send" variant="primary" className="w-full justify-center" confirm="Mark this proposal as sent?" /> : null}
                {p.status === "SENT" ? <ActionButton action={markProposalViewed} fields={{ id: p.id }} label="Mark as viewed" icon="eye" variant="secondary" className="w-full justify-center" /> : null}
                {["SENT", "VIEWED"].includes(p.status) ? (
                  <>
                    <ActionButton action={decideProposal} fields={{ id: p.id, decision: "ACCEPTED" }} label="Record acceptance" icon="check" variant="primary" className="w-full justify-center" confirm="Record that the client accepted this proposal?" />
                    <ActionButton action={decideProposal} fields={{ id: p.id, decision: "REJECTED" }} label="Record rejection" icon="x" variant="secondary" className="w-full justify-center" confirm="Record that the client rejected this proposal?" />
                  </>
                ) : null}
                {p.status === "ACCEPTED" && !invoiceId ? (
                  <ActionButton action={convertProposalToInvoice} fields={{ id: p.id }} label={p.advancePct > 0 && p.advancePct < 100 ? "Create advance invoice" : "Create invoice"} icon="receipt" variant="primary" className="w-full justify-center" />
                ) : null}
                {invoiceId ? (
                  <ButtonLink href={`/invoices/${invoiceId}`} variant="secondary">
                    <Icon name="receipt" />
                    View invoice
                  </ButtonLink>
                ) : null}
                <ActionButton action={duplicateProposal} fields={{ id: p.id }} label="Duplicate" icon="copy" variant="secondary" className="w-full justify-center" />
                <ActionButton action={deleteProposal} fields={{ id: p.id }} label="Delete" icon="trash" variant="danger" className="w-full justify-center" confirm={`Delete “${p.title}”? This cannot be undone.`} />
              </div>
            </Panel>
          ) : null}

          <Panel title="Details">
            <DetailRow label="Status"><StatusBadge status={p.status} /></DetailRow>
            <DetailRow label="Value">{inr(total)}</DetailRow>
            <DetailRow label="Advance">{p.advancePct}% · {inr(advance)}</DetailRow>
            <DetailRow label="Created">{fmtDate(p.createdAt)}</DetailRow>
            <DetailRow label="Sent">{fmtDate(p.sentAt)}</DetailRow>
            <DetailRow label="Valid until">{fmtDate(p.validUntil)}</DetailRow>
            <DetailRow label="Decided">{fmtDate(p.decidedAt)}</DetailRow>
          </Panel>

          <Panel title="History">
            {history.length === 0 ? (
              <p className="text-sm text-muted">No recorded activity yet.</p>
            ) : (
              <ol className="flex flex-col gap-3 text-sm">
                {history.map((h) => (
                  <li key={h.id} className="flex flex-col">
                    <span className="font-medium">{ACTION_LABEL[h.action] ?? h.action}</span>
                    <span className="text-xs text-muted">
                      {h.actorId ? (names.get(h.actorId) ?? "Member") : "System"} · {fmtDateTime(h.createdAt)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </aside>
      </div>
    </div>
  );
}
