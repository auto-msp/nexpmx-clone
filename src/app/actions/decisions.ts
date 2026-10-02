"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { runAction, fStr, fOpt, fIk, type ActionResult } from "@/lib/action";
import { withIdempotency } from "@/lib/idempotency";

const createDecisionSchema = z.object({
  title: z.string().trim().min(1, "Give the decision a short title").max(160),
  body: z.string().trim().min(1, "Explain what was decided and why").max(5000),
});

export async function createDecision(fd: FormData): Promise<ActionResult> {
  return runAction("decision:write", async (ctx) => {
    const ik = fIk(fd);
    const p = createDecisionSchema.parse({ title: fStr(fd, "title"), body: fStr(fd, "body") });

    let projectId: string | null = null;
    const pid = fOpt(fd, "projectId");
    if (pid) {
      const project = await prisma.project.findFirst({ where: { id: pid, orgId: ctx.orgId }, select: { id: true } });
      if (!project) throw new Error("Project not found.");
      projectId = project.id;
    }
    let clientId: string | null = null;
    const cid = fOpt(fd, "clientId");
    if (cid) {
      const client = await prisma.client.findFirst({ where: { id: cid, orgId: ctx.orgId }, select: { id: true } });
      if (!client) throw new Error("Client not found.");
      clientId = client.id;
    }

    const out = await withIdempotency(ctx.orgId, "decision.create", ik, (tx) =>
      tx.decision.create({
        data: { orgId: ctx.orgId, authorId: ctx.userId, title: p.title, body: p.body, projectId, clientId },
      }),
    );
    if (out.kind === "created") {
      await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "decision.created", entity: "Decision", entityId: out.entityId });
    }
    revalidatePath("/decisions");
    revalidatePath("/cio");
    return { id: out.entityId, message: "Decision logged." };
  });
}

export async function addDecisionComment(fd: FormData): Promise<ActionResult> {
  return runAction("decision:write", async (ctx) => {
    const decisionId = fStr(fd, "decisionId");
    const body = z.string().trim().min(1, "Write a comment first").max(2000).parse(fStr(fd, "body"));
    const d = await prisma.decision.findFirst({ where: { id: decisionId, orgId: ctx.orgId }, select: { id: true } });
    if (!d) throw new Error("Decision not found.");
    const c = await prisma.comment.create({
      data: { orgId: ctx.orgId, authorId: ctx.userId, body, decisionId: d.id },
    });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "decision.commented", entity: "Decision", entityId: d.id });
    revalidatePath("/decisions");
    return { id: c.id, message: "Comment added." };
  });
}

export async function deleteDecision(fd: FormData): Promise<ActionResult> {
  return runAction("decision:write", async (ctx) => {
    const id = fStr(fd, "id");
    const d = await prisma.decision.findFirst({ where: { id, orgId: ctx.orgId }, select: { id: true, authorId: true } });
    if (!d) throw new Error("Decision not found.");
    if (d.authorId !== ctx.userId && ctx.role !== "OWNER" && ctx.role !== "ADMIN") {
      throw new Error("Only the author or an admin can remove a decision.");
    }
    await prisma.decision.delete({ where: { id } });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "decision.deleted", entity: "Decision", entityId: id });
    revalidatePath("/decisions");
    return { message: "Decision removed." };
  });
}
