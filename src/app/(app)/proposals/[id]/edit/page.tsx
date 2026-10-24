import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { pageContext } from "@/lib/page";
import { prisma } from "@/lib/db";
import { dateInput } from "@/lib/format";
import { PageHeader } from "@/components/kit";
import { ProposalForm } from "@/components/finance/proposal-form";
import { parseProposalItems } from "@/components/finance/money";
import { updateProposal } from "@/app/actions/proposals";

export const metadata: Metadata = { title: "Edit proposal", robots: { index: false } };

export default async function EditProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId, canWrite } = await pageContext("invoice:write");
  const p = await prisma.proposal.findFirst({ where: { id, orgId } });
  if (!p) notFound();
  if (!canWrite || ["ACCEPTED", "REJECTED"].includes(p.status)) redirect(`/proposals/${id}`);
  const clients = await prisma.client.findMany({ where: { orgId, status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  // Keep the current client selectable even if archived.
  if (p.clientId && !clients.some((c) => c.id === p.clientId)) {
    const cur = await prisma.client.findFirst({ where: { id: p.clientId, orgId }, select: { id: true, name: true } });
    if (cur) clients.push(cur);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Edit proposal" subtitle={p.title} back={{ href: `/proposals/${id}`, label: "Back to proposal" }} />
      <div className="rounded-[var(--radius-card)] border border-border bg-surface p-5">
        <ProposalForm
          action={updateProposal}
          clients={clients}
          submitLabel="Save changes"
          initial={{
            id: p.id,
            clientId: p.clientId ?? undefined,
            title: p.title,
            summary: p.summary ?? "",
            bodyHtml: p.bodyHtml ?? "",
            validUntil: dateInput(p.validUntil),
            advancePct: p.advancePct,
            items: parseProposalItems(p.lineItemsJson),
          }}
        />
      </div>
    </div>
  );
}
