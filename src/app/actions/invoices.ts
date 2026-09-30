"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireApiContext } from "@/lib/api";
import { requirePermission } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { canTransition, nextActionsFor } from "@/lib/invoice-state";
import { requireEntitlement } from "@/lib/entitlements";
import { withIdempotency } from "@/lib/idempotency";

const createInvoiceSchema = z.object({
  clientId: z.string().trim().min(1, "Client is required"),
  number: z
    .string()
    .trim()
    .min(1, "Invoice number is required")
    .max(40)
    .regex(/^[A-Za-z0-9_-]+$/, "Numbers may only contain letters, digits, - and _"),
  amount: z.coerce.number().positive("Amount must be positive").max(100_000_000),
  dueAt: z.string().trim().optional(),
});

// Explicit state machine — invalid transitions are rejected
// (BUSINESS_RULES.md RULE-INV-01); the table lives in lib/invoice-state.ts.

export async function createInvoice(formData: FormData) {
  const ctx = await requireApiContext();
  requirePermission(ctx.role, "invoice:write");
  await requireEntitlement(ctx.orgId);

  const parsed = createInvoiceSchema.safeParse({
    clientId: formData.get("clientId"),
    number: formData.get("number"),
    amount: formData.get("amount"),
    dueAt: formData.get("dueAt") || undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }

  const client = await prisma.client.findFirst({
    where: { id: parsed.data.clientId, orgId: ctx.orgId },
    select: { id: true },
  });
  if (!client) throw new Error("Client not found in your organization");

  const amountMinor = Math.round(parsed.data.amount * 100);
  if (!Number.isSafeInteger(amountMinor)) throw new Error("Invalid amount");

  // Idempotency: retried submissions replay the original invoice.
  const ik = String(formData.get("ik") ?? "").trim();
  if (!/^[a-f0-9]{16,64}$/.test(ik)) {
    throw new Error("Your session form expired. Reload the page and try again.");
  }

  const outcome = await withIdempotency(
    ctx.orgId,
    "invoice.create",
    ik,
    async (tx) =>
      tx.invoice.create({
        data: {
          orgId: ctx.orgId,
          clientId: client.id,
          number: parsed.data.number,
          amountMinor,
          status: "DRAFT",
          dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
        },
        select: { id: true },
      }),
  );

  if (outcome.kind === "replayed") {
    revalidatePath("/invoices");
    return;
  }

  await audit({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    action: "invoice.created",
    entity: "Invoice",
    entityId: outcome.entityId,
    meta: { number: parsed.data.number, amountMinor },
  });

  revalidatePath("/invoices");
}

export async function transitionInvoice(formData: FormData) {
  const ctx = await requireApiContext();
  requirePermission(ctx.role, "invoice:write");
  await requireEntitlement(ctx.orgId);

  const id = String(formData.get("id") ?? "");
  const next = String(formData.get("status") ?? "");

  const invoice = await prisma.invoice.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!invoice) throw new Error("Invoice not found");

  if (!canTransition(invoice.status, next)) {
    throw new Error(`Cannot move invoice from ${invoice.status} to ${next}`);
  }

  await prisma.invoice.update({
    where: { id },
    data: {
      status: next as never,
      issuedAt: next === "SENT" ? new Date() : invoice.issuedAt,
    },
  });

  await audit({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    action: "invoice.status_changed",
    entity: "Invoice",
    entityId: id,
    meta: { from: invoice.status, to: next },
  });

  revalidatePath("/invoices");
}
