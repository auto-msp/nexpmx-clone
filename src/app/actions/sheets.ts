"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireApiContext } from "@/lib/api";
import { requirePermission } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { requireEntitlement } from "@/lib/entitlements";
import { parseCellsJson, MAX_CELLS_JSON_BYTES } from "@/lib/sheets-server";

const createSheetSchema = z.object({
  title: z.string().trim().min(1, "Sheet title is required").max(120),
});

export async function createSheet(formData: FormData) {
  const ctx = await requireApiContext();
  requirePermission(ctx.role, "project:write"); // docs/sheets share the write tier
  await requireEntitlement(ctx.orgId);

  const parsed = createSheetSchema.safeParse({ title: formData.get("title") });
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }

  const sheet = await prisma.sheet.create({
    data: { orgId: ctx.orgId, title: parsed.data.title, updatedBy: ctx.userId },
  });

  await audit({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    action: "sheet.created",
    entity: "Sheet",
    entityId: sheet.id,
    meta: { title: parsed.data.title },
  });

  revalidatePath("/sheets");
}

export async function renameSheet(formData: FormData) {
  const ctx = await requireApiContext();
  requirePermission(ctx.role, "project:write");
  await requireEntitlement(ctx.orgId);
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim().slice(0, 120);
  if (!title) throw new Error("Title is required");
  const sheet = await prisma.sheet.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!sheet) throw new Error("Sheet not found");
  await prisma.sheet.update({ where: { id }, data: { title, updatedBy: ctx.userId } });
  await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "sheet.renamed", entity: "Sheet", entityId: id });
  revalidatePath(`/sheets/${id}`);
  revalidatePath("/sheets");
}

export async function saveSheetCells(formData: FormData) {
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

export async function deleteSheet(formData: FormData) {
  const ctx = await requireApiContext();
  requirePermission(ctx.role, "project:write");
  await requireEntitlement(ctx.orgId);
  const id = String(formData.get("id") ?? "");
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
}
