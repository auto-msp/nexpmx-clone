"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireApiContext } from "@/lib/api";
import { requirePermission } from "@/lib/rbac";
import { audit } from "@/lib/audit";

const createDecisionSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(160),
  body: z.string().trim().min(1, "Details are required").max(5000),
  projectId: z.string().trim().optional(),
});

export async function createDecision(formData: FormData) {
  const ctx = await requireApiContext();
  requirePermission(ctx.role, "decision:write");

  const parsed = createDecisionSchema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
    projectId: formData.get("projectId") || undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }

  let projectId: string | null = null;
  if (parsed.data.projectId) {
    const project = await prisma.project.findFirst({
      where: { id: parsed.data.projectId, orgId: ctx.orgId },
      select: { id: true },
    });
    if (!project) throw new Error("Project not found in your organization");
    projectId = project.id;
  }

  const decision = await prisma.decision.create({
    data: {
      orgId: ctx.orgId,
      authorId: ctx.userId,
      title: parsed.data.title,
      body: parsed.data.body,
      projectId,
    },
  });

  await audit({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    action: "decision.created",
    entity: "Decision",
    entityId: decision.id,
  });

  revalidatePath("/decisions");
}
