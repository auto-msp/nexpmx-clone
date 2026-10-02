import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { getOrgContext } from "@/lib/tenancy";
import { prisma } from "@/lib/db";
import { canRead } from "@/lib/rbac";
import { Badge, Button, Card, EmptyState, Field, Input, SectionTitle, Select, Textarea } from "@/components/ui";
import {
  createProposal,
  markProposalSent,
  markProposalViewed,
  decideProposal,
  convertProposalToInvoice,
  deleteProposalDraft,
} from "@/app/actions/proposals";
import { newIdempotencyKey } from "@/lib/idempotency";
import { SubmitButton } from "@/components/submit-button";
import { formatInr } from "@/lib/plans";

export const metadata: Metadata = { title: "Proposals", robots: { index: false } };

const STAGES = [
  { key: "DRAFT", label: "Draft", tone: "neutral" as const },
  { key: "SENT", label: "Sent", tone: "brand" as const },
  { key: "VIEWED", label: "Viewed", tone: "warn" as const },
  { key: "ACCEPTED", label: "Accepted", tone: "success" as const },
  { key: "REJECTED", label: "Rejected", tone: "danger" as const },
];

export default async function ProposalsPage() {
  const session = await auth();
  const ctx = await getOrgContext(session!.user!.id);
  if (!canRead(ctx!.role)) throw new Error("Forbidden");

  const ik = newIdempotencyKey();

  const [proposals, clients] = await Promise.all([
    prisma.proposal.findMany({
      where: { orgId: ctx!.orgId },
      orderBy: { createdAt: "desc" },
      include: { client: { select: { name: true } } },
    }),
    prisma.client.findMany({
      where: { orgId: ctx!.orgId, status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const totals = STAGES.map((s) => ({
    ...s,
    count: proposals.filter((p) => p.status === s.key).length,
    value: proposals
      .filter((p) => p.status === s.key)
      .reduce((sum, p) => sum + p.amountMinor, 0),
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Proposals</h1>
        <p className="mt-1 text-sm text-muted">
          Your pipeline from first draft to signature — accepted proposals hand off to invoices.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {totals.map((t) => (
          <Card key={t.key} className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wider text-muted">{t.label}</span>
            <span className="text-xl font-semibold">{t.count}</span>
            <span className="text-xs text-muted">{formatInr(t.value)}</span>
          </Card>
        ))}
      </div>

      <Card>
        <SectionTitle>New proposal</SectionTitle>
        <form action={createProposal} className="mt-4 grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="ik" value={ik} />
          <Field label="Title *">
            <Input name="title" required maxLength={200} placeholder="Website revamp — phase 1" />
          </Field>
          <Field label="Client">
            <Select name="clientId" defaultValue="">
              <option value="">— no client yet —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Value (₹)">
            <Input name="amountMinor" type="number" min={0} step="1" placeholder="150000 = ₹1,500" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notes">
              <Textarea name="notes" maxLength={5000} placeholder="Scope, milestones, terms…" className="min-h-20" />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <SubmitButton pendingLabel="Creating…">Create proposal</SubmitButton>
          </div>
        </form>
      </Card>

      <section aria-label="Proposal pipeline" className="grid gap-4 lg:grid-cols-5">
        {STAGES.map((stage) => {
          const items = proposals.filter((p) => p.status === stage.key);
          return (
            <div key={stage.key} className="rounded-[var(--radius-card)] border border-border bg-surface-2/30 p-3">
              <div className="flex items-center justify-between pb-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{stage.label}</h2>
                <Badge tone={stage.tone}>{items.length}</Badge>
              </div>
              <ul className="space-y-2">
                {items.map((p) => (
                  <li key={p.id} className="rounded-[var(--radius-control)] border border-border bg-surface p-3 text-sm">
                    <div className="font-medium">{p.title}</div>
                    <div className="mt-0.5 text-xs text-muted">
                      {p.client?.name ?? "No client"} · {formatInr(p.amountMinor)}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {p.status === "DRAFT" ? (
                        <>
                          <form action={markProposalSent}>
                            <input type="hidden" name="id" value={p.id} />
                            <Button variant="secondary" type="submit" className="px-2 py-1 text-xs">Send</Button>
                          </form>
                          <form action={deleteProposalDraft}>
                            <input type="hidden" name="id" value={p.id} />
                            <Button variant="ghost" type="submit" className="px-2 py-1 text-xs">Delete</Button>
                          </form>
                        </>
                      ) : null}
                      {p.status === "SENT" ? (
                        <form action={markProposalViewed}>
                          <input type="hidden" name="id" value={p.id} />
                          <Button variant="secondary" type="submit" className="px-2 py-1 text-xs">Mark viewed</Button>
                        </form>
                      ) : null}
                      {["SENT", "VIEWED"].includes(p.status) ? (
                        <>
                          <form action={decideProposal}>
                            <input type="hidden" name="id" value={p.id} />
                            <input type="hidden" name="decision" value="ACCEPTED" />
                            <Button variant="primary" type="submit" className="px-2 py-1 text-xs">Accept</Button>
                          </form>
                          <form action={decideProposal}>
                            <input type="hidden" name="id" value={p.id} />
                            <input type="hidden" name="decision" value="REJECTED" />
                            <Button variant="ghost" type="submit" className="px-2 py-1 text-xs">Reject</Button>
                          </form>
                        </>
                      ) : null}
                      {p.status === "ACCEPTED" && p.clientId ? (
                        <form action={convertProposalToInvoice}>
                          <input type="hidden" name="id" value={p.id} />
                          <Button variant="primary" type="submit" className="px-2 py-1 text-xs">Invoice</Button>
                        </form>
                      ) : null}
                      {p.status === "ACCEPTED" && !p.clientId ? (
                        <span className="text-xs text-warn">Attach a client to invoice</span>
                      ) : null}
                    </div>
                  </li>
                ))}
                {items.length === 0 ? <li className="pb-1 text-xs text-muted">Empty</li> : null}
              </ul>
            </div>
          );
        })}
      </section>

      {proposals.length === 0 ? (
        <EmptyState
          title="No proposals yet"
          hint="Create your first proposal above — accepted proposals convert to invoices in one click."
        />
      ) : null}
    </div>
  );
}
