import { Field, Input, Select, Textarea } from "@/components/ui";
import { FormGrid, FormSection } from "@/components/kit";
import { dateInput } from "@/lib/format";
import {
  CLIENT_HEALTH_OPTIONS,
  CLIENT_SOURCES,
  CLIENT_STATUS_OPTIONS,
  INDIAN_STATES,
  INDUSTRIES,
} from "./constants";

export interface ClientFormValues {
  id?: string;
  name?: string | null;
  company?: string | null;
  industry?: string | null;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  gstin?: string | null;
  paymentTermsDays?: number | null;
  billingAddress?: string | null;
  state?: string | null;
  city?: string | null;
  pincode?: string | null;
  health?: string | null;
  status?: string | null;
  nextFollowUpAt?: Date | null;
  notes?: string | null;
}

/** Option list that also keeps a legacy value that is not in the preset list. */
function withCurrent(list: readonly string[], current?: string | null): string[] {
  return current && !list.includes(current) ? [current, ...list] : [...list];
}

/** All client fields, grouped into the four form sections. Server-safe. */
export function ClientFields({ client }: { client?: ClientFormValues }) {
  const c = client ?? {};
  return (
    <div className="flex flex-col gap-4">
      {c.id ? <input type="hidden" name="id" value={c.id} /> : null}

      <FormSection>Company info</FormSection>
      <FormGrid>
        <Field label="Client name *">
          <Input name="name" required maxLength={120} defaultValue={c.name ?? ""} placeholder="Priya Sharma" autoComplete="off" />
        </Field>
        <Field label="Company">
          <Input name="company" maxLength={120} defaultValue={c.company ?? ""} placeholder="Acme Traders Pvt Ltd" autoComplete="off" />
        </Field>
        <Field label="Industry">
          <Select name="industry" defaultValue={c.industry ?? ""}>
            <option value="">Select industry</option>
            {withCurrent(INDUSTRIES, c.industry).map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </Select>
        </Field>
        <Field label="Website">
          <Input name="website" maxLength={200} defaultValue={c.website ?? ""} placeholder="https://example.com" inputMode="url" />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" maxLength={200} defaultValue={c.email ?? ""} placeholder="accounts@example.com" />
        </Field>
        <Field label="Phone">
          <Input name="phone" maxLength={40} defaultValue={c.phone ?? ""} placeholder="+91 98765 43210" inputMode="tel" />
        </Field>
        <Field label="How did they find you?">
          <Select name="source" defaultValue={c.source ?? ""}>
            <option value="">Select source</option>
            {withCurrent(CLIENT_SOURCES, c.source).map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </Select>
        </Field>
      </FormGrid>

      <FormSection>Billing</FormSection>
      <FormGrid>
        <Field label="GSTIN">
          <Input name="gstin" maxLength={15} defaultValue={c.gstin ?? ""} placeholder="22AAAAA0000A1Z5" style={{ textTransform: "uppercase" }} autoComplete="off" />
        </Field>
        <Field label="Payment terms (days)">
          <Input name="paymentTermsDays" type="number" min={0} max={365} defaultValue={c.paymentTermsDays ?? 15} />
        </Field>
      </FormGrid>
      <Field label="Billing address">
        <Textarea name="billingAddress" maxLength={500} defaultValue={c.billingAddress ?? ""} placeholder="Building, street, area" />
      </Field>
      <FormGrid cols={3}>
        <Field label="State">
          <Select name="state" defaultValue={c.state ?? ""}>
            <option value="">Select state</option>
            {withCurrent(INDIAN_STATES, c.state).map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </Select>
        </Field>
        <Field label="City">
          <Input name="city" maxLength={80} defaultValue={c.city ?? ""} placeholder="Surat" />
        </Field>
        <Field label="Pincode">
          <Input name="pincode" maxLength={6} inputMode="numeric" pattern="[0-9]{6}" title="6-digit pincode" defaultValue={c.pincode ?? ""} placeholder="395003" />
        </Field>
      </FormGrid>

      <FormSection>Status</FormSection>
      <FormGrid cols={3}>
        <Field label="Relationship health">
          <Select name="health" defaultValue={c.health ?? "GOOD"}>
            {CLIENT_HEALTH_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Account status">
          <Select name="status" defaultValue={c.status ?? "ACTIVE"}>
            {CLIENT_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Next follow-up">
          <Input name="nextFollowUpAt" type="date" defaultValue={dateInput(c.nextFollowUpAt ?? null)} />
        </Field>
      </FormGrid>

      <FormSection>Internal notes</FormSection>
      <Field label="Private notes (never shown in the portal)">
        <Textarea name="notes" maxLength={4000} defaultValue={c.notes ?? ""} placeholder="Preferences, history, things to remember" />
      </Field>
    </div>
  );
}
