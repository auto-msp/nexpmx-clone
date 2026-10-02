"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireApiContext } from "@/lib/api";
import { requirePermission } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { requireEntitlement } from "@/lib/entitlements";
import { withIdempotency } from "@/lib/idempotency";
import { runAction, fStr, fIk, type ActionResult } from "@/lib/action";
import { parseCellsJson } from "@/lib/sheets-server";

const titleSchema = z.string().trim().min(1, "Sheet title is required").max(120, "Keep the title under 120 characters");

export async function createSheet(formData: FormData): Promise<ActionResult> {
  return runAction("project:write", async (ctx) => {
    // docs/sheets share the project write tier
    await requireEntitlement(ctx.orgId);
    const parsed = titleSchema.safeParse(fStr(formData, "title"));
    if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join("; "));

    const ik = fIk(formData);
    const out = await withIdempotency(ctx.orgId, "sheet.create", ik, (tx) =>
      tx.sheet.create({ data: { orgId: ctx.orgId, title: parsed.data, updatedBy: ctx.userId } }),
    );
    if (out.kind === "created") {
      await audit({
        orgId: ctx.orgId,
        actorId: ctx.userId,
        action: "sheet.created",
        entity: "Sheet",
        entityId: out.entityId,
        meta: { title: parsed.data },
      });
    }
    revalidatePath("/sheets");
    return { id: out.entityId, message: "Sheet created", redirect: `/sheets/${out.entityId}` };
  });
}

export async function renameSheet(formData: FormData): Promise<ActionResult> {
  return runAction("project:write", async (ctx) => {
    await requireEntitlement(ctx.orgId);
    const id = fStr(formData, "id");
    const parsed = titleSchema.safeParse(fStr(formData, "title"));
    if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
    const sheet = await prisma.sheet.findFirst({ where: { id, orgId: ctx.orgId }, select: { id: true } });
    if (!sheet) throw new Error("Sheet not found");
    await prisma.sheet.update({ where: { id }, data: { title: parsed.data, updatedBy: ctx.userId } });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "sheet.renamed", entity: "Sheet", entityId: id });
    revalidatePath(`/sheets/${id}`);
    revalidatePath("/sheets");
    return { id, message: "Renamed" };
  });
}

/**
 * Editor save. Kept as a THROWING action on purpose: the sheet grid awaits it
 * and surfaces failures through its own error handling.
 */
export async function saveSheetCells(formData: FormData): Promise<void> {
  const ctx = await requireApiContext();
  requirePermission(ctx.role, "project:write");
  await requireEntitlement(ctx.orgId);

  const id = String(formData.get("id") ?? "");
  const cellsJson = String(formData.get("cellsJson") ?? "{}");
  const cells = parseCellsJson(cellsJson);

  const sheet = await prisma.sheet.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!sheet) throw new Error("Sheet not found");

  await prisma.sheet.update({
    where: { id },
    data: { cellsJson: JSON.stringify(cells), updatedBy: ctx.userId },
  });

  await audit({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    action: "sheet.saved",
    entity: "Sheet",
    entityId: id,
    meta: { cells: Object.keys(cells).length },
  });

  revalidatePath(`/sheets/${id}`);
}

export async function deleteSheet(formData: FormData): Promise<ActionResult> {
  return runAction("project:write", async (ctx) => {
    await requireEntitlement(ctx.orgId);
    const id = fStr(formData, "id");
    const sheet = await prisma.sheet.findFirst({ where: { id, orgId: ctx.orgId } });
    if (!sheet) throw new Error("Sheet not found");
    await prisma.sheet.delete({ where: { id } });
    await audit({
      orgId: ctx.orgId,
      actorId: ctx.userId,
      action: "sheet.deleted",
      entity: "Sheet",
      entityId: id,
      meta: { title: sheet.title },
    });
    revalidatePath("/sheets");
    return { message: "Sheet deleted" };
  });
}
