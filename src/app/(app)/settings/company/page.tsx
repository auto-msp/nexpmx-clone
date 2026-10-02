import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { getOrgContext } from "@/lib/tenancy";
import { prisma } from "@/lib/db";
import { Card, Field, Input, SectionTitle } from "@/components/ui";
import { updateCompanyProfile } from "@/app/actions/settings-extended";
import { SubmitButton } from "@/components/submit-button";

export const metadata: Metadata = { title: "Company & GST", robots: { index: false } };

export default async function CompanyPage() {
  const session = await auth();
  const ctx = await getOrgContext(session!.user!.id);

  const org = await prisma.organization.findUnique({
    where: { id: ctx!.orgId },
    select: {
      name: true,
      gstin: true,
      addressLine: true,
      city: true,
      state: true,
      postalCode: true,
      country: true,
      upiId: true,
      upiPayeeName: true,
    },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Company &amp; GST</h1>
        <p className="mt-1 text-sm text-muted">
          Legal identity used on invoices and the client portal.
        </p>
      </div>

      <Card>
        <SectionTitle>Business profile</SectionTitle>
        <form action={updateCompanyProfile} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Workspace / business name *">
              <Input name="name" required maxLength={120} defaultValue={org?.name ?? ""} />
            </Field>
          </div>
          <Field label="GSTIN">
            <Input
              name="gstin"
              maxLength={15}
              defaultValue={org?.gstin ?? ""}
              placeholder="22AAAAA0000A1Z5"
              className="font-mono uppercase"
            />
          </Field>
          <Field label="Country">
            <Input name="country" maxLength={80} defaultValue={org?.country ?? "India"} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Address line">
              <Input name="addressLine" maxLength={200} defaultValue={org?.addressLine ?? ""} placeholder="Street, building" />
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
          <Field label="UPI ID (VPA)">
            <Input name="upiId" maxLength={100} defaultValue={org?.upiId ?? ""} placeholder="yourname@bank" className="font-mono" />
          </Field>
          <Field label="UPI payee name">
            <Input name="upiPayeeName" maxLength={50} defaultValue={org?.upiPayeeName ?? ""} placeholder="Legal or trade name" />
          </Field>
          <div className="sm:col-span-2 rounded-[var(--radius-control)] border border-border bg-surface-2/50 p-3 text-xs text-muted">
            <p><strong className="text-text">State</strong> decides CGST+SGST vs IGST on invoices (intra-state vs inter-state supply). <strong className="text-text">UPI ID</strong> enables “Pay via UPI” links on client-portal invoices (gross amount, standard upi:// intent).</p>
          </div>
          <div className="sm:col-span-2 flex items-center justify-between gap-4">
            <p className="text-xs text-muted">
              GSTIN is format-checked (15 chars). Checksum validation and GST filing exports are on
              the roadmap — see KNOWN_LIMITATIONS.
            </p>
            <SubmitButton pendingLabel="Saving…">Save profile</SubmitButton>
          </div>
        </form>
      </Card>
    </div>
  );
}
