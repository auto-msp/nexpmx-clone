"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { withIdempotency } from "@/lib/idempotency";
import { requireEntitlement } from "@/lib/entitlements";
import { sanitizeHtml } from "@/lib/sanitize";
import { runAction, fStr, fInt, fDate, fIk, type ActionResult, type ActionContext } from "@/lib/action";
import { emitAutomationEvent } from "./automations";
import { nextInvoiceNumber } from "@/components/finance/invoice-number";
import { proposalItemsTotal } from "@/components/finance/money";
import { MAX_MINOR } from "@/components/finance/constants";

/**
 * Proposal lifecycle: Draft → Sent → Viewed → Accepted / Rejected.
 * Every action RETURNS an ActionResult (production Next masks thrown errors).
 * Accepted fires the `proposal.signed` automation trigger.
 */

const itemSchema = z.object({
  description: z.string().trim().min(1, "Every line item needs a description").max(300),
  quantity: z.number().positive("Quantity must be above zero").max(1_000_000),
  rateMinor: z.number().int().min(0).max(MAX_MINOR),
});

function parseItems(raw: string) {
  let json: unknown = [];
  try {
    json = JSON.parse(raw || "[]");
  } catch {
    throw new Error("Line items could not be read. Reload and try again.");
  }
  const items = z.array(itemSchema).max(100, "Too many line items").parse(json);
  const total = proposalItemsTotal(items);
  if (!Number.isSafeInteger(total) || total > MAX_MINOR) throw new Error("Proposal total is too large");
  return { items, total };
}

async function parseForm(fd: FormData, ctx: ActionContext) {
  const title = z.string().trim().min(1, "Proposal title is required").max(200).parse(fStr(fd, "title"));
  const summary = z.string().max(300, "Summary is too long (300 characters max)").parse(fStr(fd, "summary"));
  const advancePct = z.number().int().min(0, "Advance must be between 0 and 100").max(100, "Advance must be between 0 and 100").parse(fInt(fd, "advancePct", 30));
  const clientId = fStr(fd, "clientId");
  if (!clientId) throw new Error("Select a client for this proposal");
  const client = await prisma.client.findFirst({ where: { id: clientId, orgId: ctx.orgId }, select: { id: true } });
  if (!client) throw new Error("Client not found in your organization");
  const { items, total } = parseItems(fStr(fd, "lineItemsJson"));
  const bodyRaw = sanitizeHtml(String(fd.get("bodyHtml") ?? "")).trim();
  const bodyHtml = bodyRaw.replace(/<[^>]*>/g, "").trim() ? bodyRaw : null;
  return {
    title,
    summary: summary || null,
    advancePct,
    clientId: client.id,
    validUntil: fDate(fd, "validUntil"),
    bodyHtml,
    lineItemsJson: JSON.stringify(items),
    amountMinor: total,
  };
}

function bump(id?: string) {
  revalidatePath("/proposals");
  if (id) revalidatePath(`/proposals/${id}`);
}

async function loadOwned(id: string, orgId: string) {
  const p = await prisma.proposal.findFirst({ where: { id, orgId } });
  if (!p) throw new Error("Proposal not found");
  return p;
}

export async function createProposal(fd: FormData): Promise<ActionResult> {
  return runAction("invoice:write", async (ctx) => {
    await requireEntitlement(ctx.orgId);
    const data = await parseForm(fd, ctx);
    const outcome = await withIdempotency(ctx.orgId, "proposal.create", fIk(fd), (tx) =>
      tx.proposal.create({ data: { orgId: ctx.orgId, ...data }, select: { id: true } }),
    );
    if (outcome.kind === "created") {
      await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "proposal.created", entity: "Proposal", entityId: outcome.entityId, meta: { title: data.title, amountMinor: data.amountMinor } });
    }
    bump();
    return { id: outcome.entityId, message: "Proposal created", redirect: `/proposals/${outcome.entityId}` };
  });
}

export async function updateProposal(fd: FormData): Promise<ActionResult> {
  return runAction("invoice:write", async (ctx) => {
    await requireEntitlement(ctx.orgId);
    const id = fStr(fd, "id");
    const existing = await loadOwned(id, ctx.orgId);
    if (["ACCEPTED", "REJECTED"].includes(existing.status)) throw new Error("Decided proposals can no longer be edited. Duplicate it instead.");
    const data = await parseForm(fd, ctx);
    await prisma.proposal.update({ where: { id }, data });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "proposal.updated", entity: "Proposal", entityId: id, meta: { amountMinor: data.amountMinor } });
    bump(id);
    return { id, message: "Changes saved", redirect: `/proposals/${id}` };
  });
}

export async function markProposalSent(fd: FormData): Promise<ActionResult> {
  return runAction("invoice:write", async (ctx) => {
    await requireEntitlement(ctx.orgId);
    const id = fStr(fd, "id");
    const p = await loadOwned(id, ctx.orgId);
    if (p.status !== "DRAFT") throw new Error("Only draft proposals can be sent");
    if (!p.clientId) throw new Error("Attach a client before sending");
    await prisma.proposal.update({ where: { id }, data: { status: "SENT", sentAt: new Date() } });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "proposal.sent", entity: "Proposal", entityId: id });
    bump(id);
    return { id, message: "Marked as sent" };
  });
}

export async function markProposalViewed(fd: FormData): Promise<ActionResult> {
  return runAction("invoice:write", async (ctx) => {
    await requireEntitlement(ctx.orgId);
    const id = fStr(fd, "id");
    const p = await loadOwned(id, ctx.orgId);
    if (!["SENT", "VIEWED"].includes(p.status)) throw new Error("Only sent proposals can be marked viewed");
    await prisma.proposal.update({ where: { id }, data: { status: "VIEWED" } });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "proposal.viewed", entity: "Proposal", entityId: id });
    bump(id);
    return { id };
  });
}

export async function decideProposal(fd: FormData): Promise<ActionResult> {
  return runAction("invoice:write", async (ctx) => {
    await requireEntitlement(ctx.orgId);
    const id = fStr(fd, "id");
    const decision = fStr(fd, "decision");
    if (!["ACCEPTED", "REJECTED"].includes(decision)) throw new Error("Invalid decision");
    const p = await loadOwned(id, ctx.orgId);
    if (["ACCEPTED", "REJECTED"].includes(p.status)) throw new Error("Proposal already decided");
    if (p.status === "DRAFT") throw new Error("Send the proposal before recording a client decision");
    await prisma.proposal.update({ where: { id }, data: { status: decision as "ACCEPTED" | "REJECTED", decidedAt: new Date() } });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: decision === "ACCEPTED" ? "proposal.accepted" : "proposal.rejected", entity: "Proposal", entityId: id });
    if (decision === "ACCEPTED") {
      await emitAutomationEvent({ trigger: "proposal.signed", subjectTitle: p.title, clientId: p.clientId, projectId: null });
    }
    bump(id);
    return { id, message: decision === "ACCEPTED" ? "Proposal accepted" : "Proposal marked as rejected" };
  });
}

/** Creates a DRAFT invoice from an accepted proposal (advance invoice when advance < 100%). */
export async function convertProposalToInvoice(fd: FormData): Promise<ActionResult> {
  return runAction("invoice:write", async (ctx) => {
    await requireEntitlement(ctx.orgId);
    const id = fStr(fd, "id");
    const p = await loadOwned(id, ctx.orgId);
    if (p.status !== "ACCEPTED") throw new Error("Only accepted proposals can be invoiced");
    if (!p.clientId) throw new Error("Attach a client before invoicing this proposal");

    const prior = await prisma.auditLog.findFirst({ where: { orgId: ctx.orgId, action: "invoice.created_from_proposal", entity: "Proposal", entityId: id } });
    if (prior) throw new Error("This proposal was already invoiced");

    const [org, client] = await Promise.all([
      prisma.organization.findUnique({ where: { id: ctx.orgId }, select: { gstin: true, state: true } }),
      prisma.client.findFirst({ where: { id: p.clientId, orgId: ctx.orgId }, select: { id: true, state: true, paymentTermsDays: true } }),
    ]);
    if (!client) throw new Error("Client not found in your organization");
    const gstBps = org?.gstin ? 1800 : 0;
    const interstate = Boolean(org?.state && client.state && org.state.trim().toLowerCase() !== client.state.trim().toLowerCase());

    let lines: Array<{ description: string; quantity: number; unit: string; rateMinor: number; gstBps: number }>;
    let items: Array<{ description?: string; quantity?: number; rateMinor?: number }> = [];
    try {
      const raw: unknown = JSON.parse(p.lineItemsJson || "[]");
      if (Array.isArray(raw)) items = raw as typeof items;
    } catch {
      items = [];
    }
    if (p.advancePct > 0 && p.advancePct < 100) {
      const advance = Math.round((p.amountMinor * p.advancePct) / 100);
      lines = [{ description: `Advance (${p.advancePct}%) — ${p.title}`, quantity: 1, unit: "Piece", rateMinor: advance, gstBps }];
    } else if (items.length > 0) {
      lines = items.map((i) => ({ description: String(i.description || p.title), quantity: Number(i.quantity) || 1, unit: "Piece", rateMinor: Math.max(0, Math.round(Number(i.rateMinor) || 0)), gstBps }));
    } else {
      lines = [{ description: p.title, quantity: 1, unit: "Piece", rateMinor: p.amountMinor, gstBps }];
    }
    const net = lines.reduce((s, l) => s + Math.round(l.quantity * l.rateMinor), 0);
    const now = new Date();
    const due = new Date(now.getTime() + (client.paymentTermsDays || 15) * 86_400_000);

    const outcome = await withIdempotency(ctx.orgId, "proposal.convert", createHash("sha256").update(id).digest("hex").slice(0, 32), async (tx) => {
      const number = await nextInvoiceNumber(tx, ctx.orgId);
      return tx.invoice.create({
        data: {
          orgId: ctx.orgId,
          clientId: p.clientId!,
          number,
          amountMinor: net,
          status: "DRAFT",
          gstRateBps: gstBps,
          interstate,
          placeOfSupply: client.state ?? null,
          gstinSnapshot: org?.gstin ?? null,
          issuedAt: now,
          dueAt: due,
          notes: `Raised against proposal: ${p.title}`,
          lines: { create: lines.map((l, position) => ({ position, ...l })) },
        },
        select: { id: true },
      });
    });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "invoice.created_from_proposal", entity: "Proposal", entityId: id, meta: { invoiceId: outcome.entityId } });
    revalidatePath("/invoices");
    revalidatePath("/finance");
    bump(id);
    return { id: outcome.entityId, message: "Draft invoice created", redirect: `/invoices/${outcome.entityId}` };
  });
}

export async function duplicateProposal(fd: FormData): Promise<ActionResult> {
  return runAction("invoice:write", async (ctx) => {
    await requireEntitlement(ctx.orgId);
    const p = await loadOwned(fStr(fd, "id"), ctx.orgId);
    const copy = await prisma.proposal.create({
      data: {
        orgId: ctx.orgId,
        clientId: p.clientId,
        title: `${p.title} (copy)`.slice(0, 200),
        amountMinor: p.amountMinor,
        summary: p.summary,
        bodyHtml: p.bodyHtml,
        lineItemsJson: p.lineItemsJson,
        advancePct: p.advancePct,
        validUntil: p.validUntil,
        notes: p.notes,
      },
      select: { id: true },
    });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "proposal.created", entity: "Proposal", entityId: copy.id, meta: { duplicatedFrom: p.id } });
    bump();
    return { id: copy.id, message: "Duplicated as a new draft", redirect: `/proposals/${copy.id}/edit` };
  });
}

/** Delete any proposal (drafts and decided alike). */
export async function deleteProposal(fd: FormData): Promise<ActionResult> {
  return runAction("invoice:write", async (ctx) => {
    await requireEntitlement(ctx.orgId);
    const id = fStr(fd, "id");
    const p = await loadOwned(id, ctx.orgId);
    await prisma.proposal.delete({ where: { id } });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "proposal.deleted", entity: "Proposal", entityId: id, meta: { title: p.title } });
    bump();
    return { message: "Proposal deleted", redirect: "/proposals" };
  });
}

/** Backwards-compatible alias: drafts only. */
export async function deleteProposalDraft(fd: FormData): Promise<ActionResult> {
  return runAction("invoice:write", async (ctx) => {
    const p = await loadOwned(fStr(fd, "id"), ctx.orgId);
    if (p.status !== "DRAFT") throw new Error("Only drafts can be deleted");
    await prisma.proposal.delete({ where: { id: p.id } });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "proposal.deleted", entity: "Proposal", entityId: p.id, meta: { title: p.title } });
    bump();
    return { message: "Draft deleted", redirect: "/proposals" };
  });
}
