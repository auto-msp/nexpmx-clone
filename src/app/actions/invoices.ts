"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { canTransition } from "@/lib/invoice-state";
import { requireEntitlement } from "@/lib/entitlements";
import { withIdempotency } from "@/lib/idempotency";
import { isGstRateBps } from "@/lib/gst";
import { runAction, fStr, fOpt, fDate, fBool, fIk, type ActionResult } from "@/lib/action";
import { emitAutomationEvent } from "./automations";
import { nextInvoiceNumber } from "@/components/finance/invoice-number";
import { invoiceTotals } from "@/components/finance/money";
import { MAX_MINOR } from "@/components/finance/constants";

// Explicit state machine — invalid transitions are rejected
// (BUSINESS_RULES.md RULE-INV-01); the table lives in lib/invoice-state.ts.

const lineSchema = z.object({
  description: z.string().trim().min(1, "Every line needs a description").max(300),
  quantity: z.number().positive("Quantity must be above zero").max(1_000_000),
  unit: z.string().trim().max(20).default("Piece"),
  rateMinor: z.number().int().min(0).max(MAX_MINOR),
  gstBps: z.number().int().refine((v) => isGstRateBps(v), "Invalid GST rate — choose 0, 5, 12, 18 or 28%"),
});

function bump(id?: string) {
  revalidatePath("/invoices");
  revalidatePath("/finance");
  if (id) revalidatePath(`/invoices/${id}`);
}

/**
 * Create an invoice from the full-page composer. `intent` = "draft" | "send".
 * Number is generated server-side (INV-YYYY-0001); Invoice.amountMinor is NET.
 */
export async function createInvoice(fd: FormData): Promise<ActionResult> {
  return runAction("invoice:write", async (ctx) => {
    await requireEntitlement(ctx.orgId);

    const clientId = fStr(fd, "clientId");
    if (!clientId) throw new Error("Select a client");
    const client = await prisma.client.findFirst({ where: { id: clientId, orgId: ctx.orgId }, select: { id: true, state: true } });
    if (!client) throw new Error("Client not found in your organization");

    const projectId = fOpt(fd, "projectId");
    if (projectId) {
      const proj = await prisma.project.findFirst({ where: { id: projectId, orgId: ctx.orgId }, select: { id: true } });
      if (!proj) throw new Error("Project not found in your organization");
    }

    let raw: unknown = [];
    try {
      raw = JSON.parse(fStr(fd, "linesJson") || "[]");
    } catch {
      throw new Error("Line items could not be read. Reload and try again.");
    }
    const lines = z.array(lineSchema).min(1, "Add at least one line item").max(100, "Too many line items").parse(raw);

    const interstate = fBool(fd, "interstate");
    const totals = invoiceTotals(lines, interstate);
    if (totals.netMinor <= 0) throw new Error("Invoice total must be above zero");
    if (totals.grossMinor > MAX_MINOR) throw new Error("Invoice total is too large");

    const issuedAt = fDate(fd, "issueDate") ?? new Date();
    const dueAt = fDate(fd, "dueDate");
    if (dueAt && dueAt.getTime() < new Date(issuedAt.getFullYear(), issuedAt.getMonth(), issuedAt.getDate()).getTime()) {
      throw new Error("Due date cannot be before the issue date");
    }
    const send = fStr(fd, "intent") === "send";
    const placeOfSupply = fOpt(fd, "placeOfSupply") ?? client.state ?? null;
    const dominant = lines.find((l) => l.gstBps > 0)?.gstBps ?? 0;

    const org = await prisma.organization.findUnique({ where: { id: ctx.orgId }, select: { gstin: true } });

    const outcome = await withIdempotency(ctx.orgId, "invoice.create", fIk(fd), async (tx) => {
      const number = await nextInvoiceNumber(tx, ctx.orgId, issuedAt.getFullYear());
      return tx.invoice.create({
        data: {
          orgId: ctx.orgId,
          clientId: client.id,
          projectId,
          number,
          amountMinor: totals.netMinor,
          status: send ? "SENT" : "DRAFT",
          gstRateBps: dominant,
          placeOfSupply,
          interstate,
          gstinSnapshot: org?.gstin ?? null,
          issuedAt,
          dueAt,
          notes: fOpt(fd, "notes"),
          terms: fOpt(fd, "terms"),
          bankDetails: fOpt(fd, "bankDetails"),
          lines: { create: lines.map((l, position) => ({ position, description: l.description, quantity: l.quantity, unit: l.unit || "Piece", rateMinor: l.rateMinor, gstBps: l.gstBps })) },
        },
        select: { id: true },
      });
    });

    if (outcome.kind === "created") {
      await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "invoice.created", entity: "Invoice", entityId: outcome.entityId, meta: { amountMinor: totals.netMinor, grossMinor: totals.grossMinor, status: send ? "SENT" : "DRAFT" } });
    }
    bump();
    return { id: outcome.entityId, message: send ? "Invoice created and marked sent" : "Draft saved", redirect: `/invoices/${outcome.entityId}` };
  });
}

/** Move an invoice along the state machine (fields: id, status). */
export async function transitionInvoice(fd: FormData): Promise<ActionResult> {
  return runAction("invoice:write", async (ctx) => {
    await requireEntitlement(ctx.orgId);
    const id = fStr(fd, "id");
    const next = fStr(fd, "status");

    const invoice = await prisma.invoice.findFirst({ where: { id, orgId: ctx.orgId } });
    if (!invoice) throw new Error("Invoice not found");
    if (!canTransition(invoice.status, next)) throw new Error(`Cannot move invoice from ${invoice.status} to ${next}`);

    await prisma.invoice.update({
      where: { id },
      data: { status: next as "SENT" | "PAID" | "OVERDUE", issuedAt: next === "SENT" ? (invoice.issuedAt ?? new Date()) : invoice.issuedAt },
    });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "invoice.status_changed", entity: "Invoice", entityId: id, meta: { from: invoice.status, to: next } });

    if (next === "PAID" && invoice.status !== "PAID") {
      await emitAutomationEvent({ trigger: "invoice.paid", subjectTitle: invoice.number, clientId: invoice.clientId, projectId: null });
    }
    bump(id);
    return { id, message: next === "PAID" ? "Marked as paid" : next === "SENT" ? "Marked as sent" : "Status updated" };
  });
}

/** Drafts only — issued invoices are part of the books. */
export async function deleteInvoice(fd: FormData): Promise<ActionResult> {
  return runAction("invoice:write", async (ctx) => {
    await requireEntitlement(ctx.orgId);
    const id = fStr(fd, "id");
    const invoice = await prisma.invoice.findFirst({ where: { id, orgId: ctx.orgId }, select: { id: true, status: true, number: true } });
    if (!invoice) throw new Error("Invoice not found");
    if (invoice.status !== "DRAFT") throw new Error("Only draft invoices can be deleted");
    await prisma.invoice.delete({ where: { id } });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "invoice.deleted", entity: "Invoice", entityId: id, meta: { number: invoice.number } });
    bump();
    return { message: "Draft deleted", redirect: "/invoices" };
  });
}
