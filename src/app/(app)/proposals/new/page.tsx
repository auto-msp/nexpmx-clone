import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { pageContext } from "@/lib/page";
import { prisma } from "@/lib/db";
import { PageHeader, EmptyPanel } from "@/components/kit";
import { ButtonLink } from "@/components/ui";
import { ProposalForm } from "@/components/finance/proposal-form";
import { createProposal } from "@/app/actions/proposals";

export const metadata: Metadata = { title: "New proposal", robots: { index: false } };

export default async function NewProposalPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { orgId, canWrite } = await pageContext("invoice:write");
  if (!canWrite) redirect("/proposals");
  const params = await searchParams;
  const clientParam = Array.isArray(params.client) ? params.client[0] : params.client;
  const clients = await prisma.client.findMany({ where: { orgId, status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="New proposal" subtitle="Describe the scope, price it, then send it for signature." back={{ href: "/proposals", label: "All proposals" }} />
      {clients.length === 0 ? (
        <EmptyPanel icon="building" title="Add a client first" hint="Proposals are written for a client." action={<ButtonLink href="/clients">Go to clients</ButtonLink>} />
      ) : (
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-5">
          <ProposalForm action={createProposal} clients={clients} initial={{ clientId: clients.some((c) => c.id === clientParam) ? clientParam : undefined }} submitLabel="Create proposal" />
        </div>
      )}
    </div>
  );
}
