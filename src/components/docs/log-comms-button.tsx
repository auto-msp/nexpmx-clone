import { ModalButton, ActionForm } from "@/components/kit-client";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { FormGrid } from "@/components/kit";
import { logComms } from "@/app/actions/comms";
import { dateInput } from "@/lib/format";
import { CHANNELS } from "@/components/docs/comms-ui";

export function LogCommsButton({
  clients,
  defaultClientId,
  variant = "primary",
  label = "Log a message",
}: {
  clients: Array<{ id: string; name: string }>;
  defaultClientId?: string;
  variant?: "primary" | "secondary";
  label?: string;
}) {
  return (
    <ModalButton
      label={label}
      title="Log a message"
      icon="plus"
      variant={variant}
      description="Record an email, call, meeting or note so the whole team knows what was said."
    >
      <ActionForm action={logComms} submitLabel="Save to log" pendingLabel="Saving…">
        <FormGrid>
          <Field label="Client">
            <Select name="clientId" defaultValue={defaultClientId ?? ""}>
              <option value="">General (no client)</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date">
            <Input name="sentAt" type="date" defaultValue={dateInput(new Date())} max={dateInput(new Date())} />
          </Field>
          <Field label="Channel">
            <Select name="channel" defaultValue="EMAIL">
              {CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Direction">
            <Select name="direction" defaultValue="OUT">
              <option value="OUT">We sent / we reached out</option>
              <option value="IN">They sent / they reached out</option>
            </Select>
          </Field>
        </FormGrid>
        <Field label="Subject *">
          <Input name="subject" required maxLength={200} placeholder="Weekly update, week 40" />
        </Field>
        <Field label="Details">
          <Textarea name="body" maxLength={10000} placeholder="What was discussed, decided or promised…" />
        </Field>
      </ActionForm>
    </ModalButton>
  );
}
