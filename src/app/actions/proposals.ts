"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireApiContext } from "@/lib/api";
import { requirePermission } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { withIdempotency } from "@/lib/idempotency";
import { requireEntitlement } from "@/lib/entitlements";
import { emitAutomationEvent } from "./automations";

/**
 * Proposal lifecycle. Observed pipeline stages (screenshot evidence):
 * Draft → Sent → Viewed → Accepted / Rejected, with per-stage value totals
 * and a signed→invoice hand-off automation. State changes are explicit and
 * audited; Accepted is what fires `proposal.signed` automations.
 */

const PROPOSAL_STATUSES = ["DRAFT", "SENT", "VIEWED", "ACCEPTED", "REJECTED"] as const;
void PROPOSAL_STATUSES;

const createProposalSchema = z.object({
  title: z.string().trim().min(1, "Proposal title is required").max(200),
  clientId: z.string().trim().optional(),
  amountMinor: z.coerce.number().int().min(0).max(10_000_000_000).default(0),
  notes: z.string().trim().max(5000).optional(),
});

export async function createProposal(formData: FormData) {
  const ctx = await requireApiContext();
  requirePermission(ctx.role, "invoice:write"); // pipeline = revenue surface
  await requireEntitlement(ctx.orgId);

  const parsed = createProposalSchema.safeParse({
    title: formData.get("title"),
    clientId: formData.get("clientId") || undefined,
    amountMinor: formData.get("amountMinor") || 0,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }

  let clientId: string | null = null;
  if (parsed.data.clientId) {
    const client = await prisma.client.findFirst({
      where: { id: parsed.data.clientId, orgId: ctx.orgId },
      select: { id: true },
    });
    if (!client) throw new Error("Client not found in your organization");
    clientId = client.id;
  }

  const ik = String(formData.get("ik") ?? "").trim();
  if (!/^[a-f0-9]{16,64}$/.test(ik)) {
    throw new Error("Your session form expired. Reload the page and try again.");
  }

  const outcome = await withIdempotency(ctx.orgId, "proposal.create", ik, (tx) =>
    tx.proposal.create({
      data: {
        orgId: ctx.orgId,
        clientId,
        title: parsed.data.title,
        amountMinor: parsed.data.amountMinor,
        notes: parsed.data.notes ?? null,
      },
      select: { id: true },
    }),
  );

  if (outcome.kind === "replayed") {
    revalidatePath("/proposals");
    return;
  }

  await audit({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    action: "proposal.created",
    entity: "Proposal",
    entityId: outcome.entityId,
    meta: { title: parsed.data.title },
  });

  revalidatePath("/proposals");
}

async function loadOwnedProposal(id: string, orgId: string) {
  const p = await prisma.proposal.findFirst({ where: { id, orgId } });
  if (!p) throw new Error("Proposal not found");
  return p;
}

export async function markProposalSent(formData: FormData) {
  const ctx = await requireApiContext();
  requirePermission(ctx.role, "invoice:write");
  await requireEntitlement(ctx.orgId);
  const id = String(formData.get("id") ?? "");
  const p = await loadOwnedProposal(id, ctx.orgId);
  if (p.status !== "DRAFT") throw new Error("Only draft proposals can be sent");
  await prisma.proposal.update({ where: { id }, data: { status: "SENT", sentAt: new Date() } });
  await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "proposal.sent", entity: "Proposal", entityId: id });
  revalidatePath("/proposals");
}

export async function markProposalViewed(formData: FormData) {
  const ctx = await requireApiContext();
  requirePermission(ctx.role, "invoice:write");
  await requireEntitlement(ctx.orgId);
  const id = String(formData.get("id") ?? "");
  const p = await loadOwnedProposal(id, ctx.orgId);
  if (!["SENT", "VIEWED"].includes(p.status)) throw new Error("Only sent proposals can be marked viewed");
  await prisma.proposal.update({ where: { id }, data: { status: "VIEWED" } });
  await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "proposal.viewed", entity: "Proposal", entityId: id });
  revalidatePath("/proposals");
}

export async function decideProposal(formData: FormData) {
  const ctx = await requireApiContext();
  requirePermission(ctx.role, "invoice:write");
  await requireEntitlement(ctx.orgId);

  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!["ACCEPTED", "REJECTED"].includes(decision)) throw new Error("Invalid decision");

  const p = await loadOwnedProposal(id, ctx.orgId);
  if (["ACCEPTED", "REJECTED"].includes(p.status)) throw new Error("Proposal already decided");
  if (p.status === "DRAFT") throw new Error("Send the proposal before recording a client decision");

  await prisma.proposal.update({
    where: { id },
    data: { status: decision as never, decidedAt: new Date() },
  });
  await audit({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    action: decision === "ACCEPTED" ? "proposal.accepted" : "proposal.rejected",
    entity: "Proposal",
    entityId: id,
  });

  if (decision === "ACCEPTED") {
    await emitAutomationEvent({
      trigger: "proposal.signed",
      subjectTitle: p.title,
      clientId: p.clientId,
      projectId: null,
    });
  }

  revalidatePath("/proposals");
}

export async function convertProposalToInvoice(formData: FormData) {
  const ctx = await requireApiContext();
  requirePermission(ctx.role, "invoice:write");
  await requireEntitlement(ctx.orgId);

  const id = String(formData.get("id") ?? "");
  const p = await loadOwnedProposal(id, ctx.orgId);
  if (p.status !== "ACCEPTED") throw new Error("Only accepted proposals can be invoiced");
  if (!p.clientId) throw new Error("Attach a client before invoicing this proposal");

  const existing = await prisma.invoice.findFirst({
    where: { orgId: ctx.orgId, clientId: p.clientId, number: `PROP-${id.slice(-6).toUpperCase()}` },
  });
  if (existing) throw new Error("This proposal was already invoiced");

  const count = await prisma.invoice.count({ where: { orgId: ctx.orgId } });
  const number = `PROP-${id.slice(-6).toUpperCase()}`;
  await prisma.invoice.create({
    data: {
      orgId: ctx.orgId,
      clientId: p.clientId,
      number,
      amountMinor: p.amountMinor,
      status: "DRAFT",
    },
  });
  await audit({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    action: "invoice.created_from_proposal",
    entity: "Invoice",
    entityId: number,
    meta: { proposalId: id },
  });
  void count;
  revalidatePath("/invoices");
  revalidatePath("/proposals");
}

export async function deleteProposalDraft(formData: FormData) {
  const ctx = await requireApiContext();
  requirePermission(ctx.role, "invoice:write");
  await requireEntitlement(ctx.orgId);
  const id = String(formData.get("id") ?? "");
  const p = await loadOwnedProposal(id, ctx.orgId);
  if (p.status !== "DRAFT") throw new Error("Only drafts can be deleted");
  await prisma.proposal.delete({ where: { id } });
  await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "proposal.deleted", entity: "Proposal", entityId: id });
  revalidatePath("/proposals");
}
