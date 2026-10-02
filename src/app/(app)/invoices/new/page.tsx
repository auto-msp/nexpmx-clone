import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { pageContext } from "@/lib/page";
import { prisma } from "@/lib/db";
import { sp } from "@/lib/format";
import { ButtonLink } from "@/components/ui";
import { PageHeader, EmptyPanel } from "@/components/kit";
import { InvoiceForm } from "@/components/finance/invoice-form";
import { createInvoice } from "@/app/actions/invoices";

export const metadata: Metadata = { title: "New invoice", robots: { index: false } };

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { orgId, canWrite } = await pageContext("invoice:write");
  if (!canWrite) redirect("/invoices");
  const params = await searchParams;
  const clientParam = sp(params.client);

  const [org, clients, projects, last] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId }, select: { gstin: true, state: true } }),
    prisma.client.findMany({
      where: { orgId, status: "ACTIVE" },
      select: { id: true, name: true, paymentTermsDays: true, state: true },
      orderBy: { name: "asc" },
    }),
    prisma.project.findMany({ where: { orgId }, select: { id: true, name: true, clientId: true }, orderBy: { name: "asc" } }),
    prisma.invoice.findFirst({ where: { orgId }, orderBy: { createdAt: "desc" }, select: { terms: true, bankDetails: true } }),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="New invoice" subtitle="Add the work you billed for. Totals and GST update as you type; the invoice number is assigned automatically." back={{ href: "/invoices", label: "All invoices" }} />
      {clients.length === 0 ? (
        <EmptyPanel icon="building" title="Add a client first" hint="Invoices are raised against a client." action={<ButtonLink href="/clients">Go to clients</ButtonLink>} />
      ) : (
        <InvoiceForm
          action={createInvoice}
          clients={clients}
          projects={projects}
          orgState={org?.state ?? null}
          defaultGstBps={org?.gstin ? 1800 : 0}
          defaults={{ notes: "", terms: last?.terms ?? "", bankDetails: last?.bankDetails ?? "" }}
          initialClientId={clients.some((c) => c.id === clientParam) ? clientParam : undefined}
        />
      )}
    </div>
  );
}
