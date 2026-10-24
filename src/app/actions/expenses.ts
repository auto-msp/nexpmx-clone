"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireEntitlement } from "@/lib/entitlements";
import { withIdempotency } from "@/lib/idempotency";
import { runAction, fStr, fOpt, fDate, fBool, fMoneyMinor, fIk, type ActionResult } from "@/lib/action";
import { EXPENSE_CATEGORIES, MAX_MINOR } from "@/components/finance/constants";

const expenseSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES, { message: "Choose a category" }),
  description: z.string().trim().min(1, "Add a short description").max(300),
  receiptUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => !v || /^https?:\/\//i.test(v), "Receipt link must start with http:// or https://")
    .optional(),
});

function bump() {
  revalidatePath("/expenses");
  revalidatePath("/finance");
}

export async function createExpense(fd: FormData): Promise<ActionResult> {
  return runAction("invoice:write", async (ctx) => {
    await requireEntitlement(ctx.orgId);
    const parsed = expenseSchema.parse({
      category: fStr(fd, "category"),
      description: fStr(fd, "description"),
      receiptUrl: fStr(fd, "receiptUrl") || undefined,
    });
    const amountMinor = fMoneyMinor(fd, "amount");
    if (amountMinor <= 0) throw new Error("Amount must be above zero");
    if (amountMinor > MAX_MINOR) throw new Error("Amount is too large");

    const projectId = fOpt(fd, "projectId");
    if (projectId) {
      const proj = await prisma.project.findFirst({ where: { id: projectId, orgId: ctx.orgId }, select: { id: true } });
      if (!proj) throw new Error("Project not found in your organization");
    }
    const spentOn = fDate(fd, "spentOn") ?? new Date();

    const outcome = await withIdempotency(ctx.orgId, "expense.create", fIk(fd), (tx) =>
      tx.expense.create({
        data: {
          orgId: ctx.orgId,
          category: parsed.category,
          description: parsed.description,
          amountMinor,
          projectId,
          spentOn,
          receiptUrl: parsed.receiptUrl ?? null,
          gstDeductible: fBool(fd, "gstDeductible"),
          loggedById: ctx.userId,
        },
        select: { id: true },
      }),
    );
    if (outcome.kind === "created") {
      await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "expense.created", entity: "Expense", entityId: outcome.entityId, meta: { category: parsed.category, amountMinor } });
    }
    bump();
    return { id: outcome.entityId, message: "Expense logged" };
  });
}

export async function deleteExpense(fd: FormData): Promise<ActionResult> {
  return runAction("invoice:write", async (ctx) => {
    await requireEntitlement(ctx.orgId);
    const id = fStr(fd, "id");
    const e = await prisma.expense.findFirst({ where: { id, orgId: ctx.orgId }, select: { id: true, category: true, amountMinor: true } });
    if (!e) throw new Error("Expense not found");
    await prisma.expense.delete({ where: { id } });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "expense.deleted", entity: "Expense", entityId: id, meta: { category: e.category, amountMinor: e.amountMinor } });
    bump();
    return { message: "Expense deleted" };
  });
}
