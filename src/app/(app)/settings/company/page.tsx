import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { pageContext } from "@/lib/page";
import { PageHeader, Panel, FormGrid, FormSection } from "@/components/kit";
import { ActionForm } from "@/components/kit-client";
import { Field, Input } from "@/components/ui";
import { updateCompanyProfile } from "@/app/actions/settings-extended";

export const metadata: Metadata = { title: "Company & GST", robots: { index: false } };

export default async function CompanyPage() {
  const { orgId, canWrite: canManage } = await pageContext("org:manage");

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { name: true, gstin: true, addressLine: true, city: true, state: true, postalCode: true, country: true, upiId: true, upiPayeeName: true },
  });

  return (
    <>
      <PageHeader title="Company & GST" subtitle="The legal identity printed on invoices and shown in the client portal." />
      <Panel title="Business profile">
        {!canManage ? <p className="mb-3 rounded-[var(--radius-control)] bg-surface-2 px-3 py-2 text-xs text-muted">Only the owner can edit company details.</p> : null}
        <ActionForm action={updateCompanyProfile} submitLabel="Save profile" pendingLabel="Saving…" hideSubmit={!canManage} resetOnSuccess={false}>
          <fieldset disabled={!canManage} className="flex flex-col gap-4 disabled:opacity-80">
            <FormSection>Identity</FormSection>
            <FormGrid>
              <div className="sm:col-span-2">
                <Field label="Business name *">
                  <Input name="name" required maxLength={120} defaultValue={org?.name ?? ""} />
                </Field>
              </div>
              <Field label="GSTIN">
                <Input name="gstin" maxLength={15} defaultValue={org?.gstin ?? ""} placeholder="22AAAAA0000A1Z5" className="font-mono uppercase" />
              </Field>
              <Field label="Country">
                <Input name="country" maxLength={80} defaultValue={org?.country ?? "India"} />
              </Field>
            </FormGrid>
            <FormSection>Address</FormSection>
            <FormGrid>
              <div className="sm:col-span-2">
                <Field label="Address line">
                  <Input name="addressLine" maxLength={200} defaultValue={org?.addressLine ?? ""} placeholder="Street, building, area" />
                </Field>
              </div>
              <Field label="City">
                <Input name="city" maxLength={80} defaultValue={org?.city ?? ""} />
              </Field>
              <Field label="State">
                <Input name="state" maxLength={80} defaultValue={org?.state ?? ""} />
              </Field>
              <Field label="Postal code">
                <Input name="postalCode" maxLength={12} defaultValue={org?.postalCode ?? ""} />
              </Field>
            </FormGrid>
            <FormSection>Payments</FormSection>
            <FormGrid>
              <Field label="UPI ID (VPA)">
                <Input name="upiId" maxLength={100} defaultValue={org?.upiId ?? ""} placeholder="yourname@bank" className="font-mono" />
              </Field>
              <Field label="UPI payee name">
                <Input name="upiPayeeName" maxLength={50} defaultValue={org?.upiPayeeName ?? ""} placeholder="Legal or trade name" />
              </Field>
            </FormGrid>
          </fieldset>
          <div className="rounded-[var(--radius-control)] border border-border bg-surface-2/50 p-3 text-xs text-muted">
            <p>
              <strong className="text-text">State</strong> decides CGST + SGST versus IGST on invoices (within the state or across states).{" "}
              <strong className="text-text">UPI ID</strong> adds a &ldquo;Pay via UPI&rdquo; link to portal invoices. GSTIN is format-checked (15 characters).
            </p>
          </div>
        </ActionForm>
      </Panel>
    </>
  );
}
