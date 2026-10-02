"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireApiContext } from "@/lib/api";
import { requirePermission } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { emitAutomationEvent } from "./automations";

const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Project name is required").max(120),
  clientId: z.string().trim().optional(),
});

export async function createProject(formData: FormData) {
  const ctx = await requireApiContext();
  requirePermission(ctx.role, "project:write");

  const parsed = createProjectSchema.safeParse({
    name: formData.get("name"),
    clientId: formData.get("clientId") || undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }

  // Verify the client belongs to this org (IDOR defense — never trust the FK).
  let clientId: string | null = null;
  if (parsed.data.clientId) {
    const client = await prisma.client.findFirst({
      where: { id: parsed.data.clientId, orgId: ctx.orgId },
      select: { id: true },
    });
    if (!client) throw new Error("Client not found in your organization");
    clientId = client.id;
  }

  const project = await prisma.project.create({
    data: { orgId: ctx.orgId, name: parsed.data.name, clientId },
  });

  await audit({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    action: "project.created",
    entity: "Project",
    entityId: project.id,
    meta: { name: project.name },
  });

  await emitAutomationEvent({
    trigger: "project.created",
    subjectTitle: project.name,
    clientId,
    projectId: project.id,
  });

  revalidatePath("/projects");
}

export async function updateProjectStatus(formData: FormData) {
  const ctx = await requireApiContext();
  requirePermission(ctx.role, "project:write");

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!["ACTIVE", "PAUSED", "COMPLETED"].includes(status)) {
    throw new Error("Invalid status");
  }

  const existing = await prisma.project.findFirst({
    where: { id, orgId: ctx.orgId },
  });
  if (!existing) throw new Error("Project not found");

  await prisma.project.update({ where: { id }, data: { status: status as never } });
  await audit({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    action: "project.status_changed",
    entity: "Project",
    entityId: id,
    meta: { status },
  });
  revalidatePath("/projects");
}

const createTaskSchema = z.object({
  projectId: z.string().trim().min(1),
  title: z.string().trim().min(1, "Task title is required").max(200),
});

export async function createTask(formData: FormData) {
  const ctx = await requireApiContext();
  requirePermission(ctx.role, "task:write");

  const parsed = createTaskSchema.safeParse({
    projectId: formData.get("projectId"),
    title: formData.get("title"),
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }

  const project = await prisma.project.findFirst({
    where: { id: parsed.data.projectId, orgId: ctx.orgId },
    select: { id: true },
  });
  if (!project) throw new Error("Project not found in your organization");

  await prisma.task.create({
    data: { orgId: ctx.orgId, projectId: project.id, title: parsed.data.title },
  });

  await audit({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    action: "task.created",
    entity: "Task",
    entityId: project.id,
  });
  revalidatePath("/projects");
}

export async function setTaskStatus(formData: FormData) {
  const ctx = await requireApiContext();
  requirePermission(ctx.role, "task:write");

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!["TODO", "IN_PROGRESS", "DONE"].includes(status)) {
    throw new Error("Invalid status");
  }

  // Org-scope verify through the parent project relationship.
  const task = await prisma.task.findFirst({
    where: { id, orgId: ctx.orgId },
  });
  if (!task) throw new Error("Task not found");

  await prisma.task.update({ where: { id }, data: { status: status as never } });

  if (status === "DONE" && task.status !== "DONE") {
    await emitAutomationEvent({
      trigger: "task.completed",
      subjectTitle: task.title,
      projectId: task.projectId,
      clientId: null,
    });
  }

  revalidatePath("/projects");
}
