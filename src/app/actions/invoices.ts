"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireApiContext } from "@/lib/api";
import { requirePermission } from "@/lib/rbac";
import { audit } from "@/lib/audit";

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

// Explicit state machine — invalid transitions are rejected (BUSINESS_RULES.md).
const TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["SENT"],
  SENT: ["PAID", "OVERDUE"],
  PAID: [],
  OVERDUE: ["PAID"],
};

export async function createInvoice(formData: FormData) {
  const ctx = await requireApiContext();
  requirePermission(ctx.role, "invoice:write");

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

  try {
    await prisma.invoice.create({
      data: {
        orgId: ctx.orgId,
        clientId: client.id,
        number: parsed.data.number,
        amountMinor,
        status: "DRAFT",
        dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
      },
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      throw new Error("An invoice with this number already exists");
    }
    throw e;
  }

  await audit({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    action: "invoice.created",
    entity: "Invoice",
    meta: { number: parsed.data.number, amountMinor },
  });

  revalidatePath("/invoices");
}

export async function transitionInvoice(formData: FormData) {
  const ctx = await requireApiContext();
  requirePermission(ctx.role, "invoice:write");

  const id = String(formData.get("id") ?? "");
  const next = String(formData.get("status") ?? "");

  const invoice = await prisma.invoice.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!invoice) throw new Error("Invoice not found");

  if (!TRANSITIONS[invoice.status]?.includes(next)) {
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
