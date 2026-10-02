import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { getOrgContext } from "@/lib/tenancy";
import { prisma } from "@/lib/db";
import { canRead } from "@/lib/rbac";
import { Badge, Button, Card, EmptyState, Field, Input, SectionTitle, Select, Textarea } from "@/components/ui";
import { logComms, deleteComms } from "@/app/actions/comms";
import { SubmitButton } from "@/components/submit-button";

export const metadata: Metadata = { title: "Comms", robots: { index: false } };

const CHANNEL_TONES: Record<string, "neutral" | "brand" | "warn" | "success"> = {
  EMAIL: "brand",
  CALL: "warn",
  MEETING: "success",
  NOTE: "neutral",
};

export default async function CommsPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; direction?: string; channel?: string }>;
}) {
  const { client: clientFilter, direction, channel } = await searchParams;
  const session = await auth();
  const ctx = await getOrgContext(session!.user!.id);
  if (!canRead(ctx!.role)) throw new Error("Forbidden");

  const [clients, messages] = await Promise.all([
    prisma.client.findMany({
      where: { orgId: ctx!.orgId, status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.commsMessage.findMany({
      where: {
        orgId: ctx!.orgId,
        ...(clientFilter ? { clientId: clientFilter } : {}),
        ...(direction === "IN" || direction === "OUT" ? { direction } : {}),
        ...(channel ? { channel } : {}),
      },
      orderBy: { sentAt: "desc" },
      take: 200,
      include: { client: { select: { name: true } } },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Comms</h1>
        <p className="mt-1 text-sm text-muted">
          Every email, call, meeting and note with your clients — searchable and logged to memory.
        </p>
      </div>

      <Card>
        <SectionTitle>Log an interaction</SectionTitle>
        <form action={logComms} className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Client">
            <Select name="clientId" defaultValue="">
              <option value="">— general (no client) —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Channel">
            <Select name="channel" defaultValue="EMAIL">
              <option value="EMAIL">Email</option>
              <option value="CALL">Call</option>
              <option value="MEETING">Meeting</option>
              <option value="NOTE">Note</option>
            </Select>
          </Field>
          <Field label="Direction">
            <Select name="direction" defaultValue="OUT">
              <option value="OUT">Outgoing (we sent)</option>
              <option value="IN">Incoming (they sent)</option>
            </Select>
          </Field>
          <Field label="Subject *">
            <Input name="subject" required maxLength={200} placeholder="Weekly update — week 40" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Details">
              <Textarea name="body" maxLength={10000} placeholder="What was discussed, decided, or promised…" />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <SubmitButton pendingLabel="Logging…">Log interaction</SubmitButton>
          </div>
        </form>
      </Card>

      <form method="GET" className="flex flex-wrap items-end gap-3">
        <div className="w-48">
          <Field label="Client">
            <Select name="client" defaultValue={clientFilter ?? ""}>
              <option value="">All clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="w-40">
          <Field label="Direction">
            <Select name="direction" defaultValue={direction ?? ""}>
              <option value="">Both</option>
              <option value="OUT">Outgoing</option>
              <option value="IN">Incoming</option>
            </Select>
          </Field>
        </div>
        <div className="w-40">
          <Field label="Channel">
            <Select name="channel" defaultValue={channel ?? ""}>
              <option value="">All channels</option>
              <option value="EMAIL">Email</option>
              <option value="CALL">Call</option>
              <option value="MEETING">Meeting</option>
              <option value="NOTE">Note</option>
            </Select>
          </Field>
        </div>
        <Button variant="secondary" type="submit">Filter</Button>
      </form>

      {messages.length === 0 ? (
        <EmptyState
          title="No conversations match"
          hint="Log your first interaction above, or clear the filters."
        />
      ) : (
        <div className="space-y-3">
          {messages.map((m) => (
            <Card key={m.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={CHANNEL_TONES[m.channel] ?? "neutral"}>{m.channel}</Badge>
                    <Badge tone={m.direction === "OUT" ? "brand" : "neutral"}>
                      {m.direction === "OUT" ? "→ sent" : "← received"}
                    </Badge>
                    <span className="text-sm font-medium">{m.subject}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {m.client?.name ?? "General"} · {m.sentAt.toISOString().slice(0, 16).replace("T", " ")}
                  </p>
                  {m.body ? (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{m.body}</p>
                  ) : null}
                </div>
                <form action={deleteComms}>
                  <input type="hidden" name="id" value={m.id} />
                  <Button variant="ghost" type="submit" className="px-2 py-1 text-xs">Remove</Button>
                </form>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
