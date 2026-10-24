"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { runAction, fStr, fOpt, fIk, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { withIdempotency } from "@/lib/idempotency";
import { ownedClientId } from "@/components/projects/data";
import { parseBoardData, serializeBoardData } from "@/components/projects/board-data";

const MAX_BOARD_BYTES = 600_000;

const boardSchema = z.object({
  name: z.string().trim().min(1, "Board name is required").max(120),
  kind: z.enum(["WHITEBOARD", "MINDMAP"]),
});

export async function createBoard(formData: FormData) {
  return runAction("project:write", async (ctx) => {
    const ik = fIk(formData);
    const data = boardSchema.parse({ name: fStr(formData, "name"), kind: fStr(formData, "kind") || "WHITEBOARD" });
    const clientId = await ownedClientId(ctx.orgId, fOpt(formData, "clientId"));
    const outcome = await withIdempotency(ctx.orgId, "board.create", ik, (tx) =>
      tx.board.create({ data: { orgId: ctx.orgId, clientId, ...data }, select: { id: true } }),
    );
    if (outcome.kind === "created") {
      await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "board.created", entity: "Board", entityId: outcome.entityId, meta: { name: data.name } });
    }
    revalidatePath("/boards");
    return { id: outcome.entityId, message: "Board created", redirect: `/boards/${outcome.entityId}` };
  });
}

export async function updateBoard(formData: FormData) {
  return runAction("project:write", async (ctx) => {
    const id = fStr(formData, "id");
    const existing = await prisma.board.findFirst({ where: { id, orgId: ctx.orgId }, select: { id: true, kind: true } });
    if (!existing) throw new Error("Board not found");
    const name = z.string().trim().min(1, "Board name is required").max(120).parse(fStr(formData, "name"));
    const clientId = await ownedClientId(ctx.orgId, fOpt(formData, "clientId"));
    await prisma.board.update({ where: { id }, data: { name, clientId } });
    revalidatePath("/boards");
    revalidatePath(`/boards/${id}`);
    return { message: "Board updated" };
  });
}

export async function deleteBoard(formData: FormData) {
  return runAction("project:write", async (ctx) => {
    const id = fStr(formData, "id");
    const existing = await prisma.board.findFirst({ where: { id, orgId: ctx.orgId }, select: { id: true, name: true } });
    if (!existing) throw new Error("Board not found");
    await prisma.board.delete({ where: { id } });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "board.deleted", entity: "Board", entityId: id, meta: { name: existing.name } });
    revalidatePath("/boards");
    return { message: "Board deleted", redirect: "/boards" };
  });
}

/**
 * Debounced autosave target for the canvas. Takes plain arguments (not FormData)
 * and re-validates / normalises the JSON before it is stored.
 */
export async function saveBoardData(boardId: string, dataJson: string): Promise<ActionResult> {
  return runAction("project:write", async (ctx) => {
    if (typeof dataJson !== "string" || dataJson.length > MAX_BOARD_BYTES) {
      throw new Error("This board is too large to save. Remove some items and try again.");
    }
    const clean = serializeBoardData(parseBoardData(dataJson));
    const res = await prisma.board.updateMany({ where: { id: String(boardId), orgId: ctx.orgId }, data: { dataJson: clean } });
    if (res.count === 0) throw new Error("Board not found");
    return { message: "Saved" };
  });
}
