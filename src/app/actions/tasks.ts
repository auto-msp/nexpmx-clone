"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { runAction, fStr, fOpt, fDate, fIk } from "@/lib/action";
import { audit } from "@/lib/audit";
import { withIdempotency } from "@/lib/idempotency";
import { emitAutomationEvent } from "./automations";
import { isTaskPriority, isTaskStatus } from "@/components/home/task-meta";

const createSchema = z.object({
  title: z.string().trim().min(1, "Give the task a title").max(200, "Title is too long (200 characters max)"),
  description: z.string().trim().max(4000, "Description is too long").optional(),
});

/** Tasks a user may touch: any project task in the org, or their own personal tasks. */
function visibleTo(userId: string) {
  return [{ projectId: { not: null } }, { createdById: userId }, { assigneeId: userId }];
}

/**
 * Create a task. With a project it is a normal project task; without one it is
 * a personal task (projectId null) assigned to the creator.
 */
export async function createTask(fd: FormData) {
  return runAction("task:write", async (ctx) => {
    const parsed = createSchema.parse({
      title: fStr(fd, "title"),
      description: fOpt(fd, "description") ?? undefined,
    });
    const priority = fStr(fd, "priority") || "MEDIUM";
    if (!isTaskPriority(priority)) throw new Error("Pick a valid priority.");

    const projectId = fOpt(fd, "projectId");
    if (projectId) {
      const p = await prisma.project.findFirst({ where: { id: projectId, orgId: ctx.orgId }, select: { id: true } });
      if (!p) throw new Error("That project no longer exists.");
    }

    let assigneeId: string | null = fOpt(fd, "assigneeId");
    if (!projectId) {
      assigneeId = ctx.userId; // personal task
    } else if (assigneeId) {
      const m = await prisma.membership.findFirst({ where: { orgId: ctx.orgId, userId: assigneeId }, select: { id: true } });
      if (!m) throw new Error("That person is not on your team.");
    }

    const rawDue = fStr(fd, "dueDate");
    const dueDate = fDate(fd, "dueDate");
    if (rawDue && !dueDate) throw new Error("That due date is not valid.");

    const out = await withIdempotency(ctx.orgId, "task.create", fIk(fd), (tx) =>
      tx.task.create({
        data: {
          orgId: ctx.orgId,
          projectId,
          title: parsed.title,
          description: parsed.description ?? null,
          priority,
          assigneeId,
          dueDate,
          createdById: ctx.userId,
          status: "TODO",
        },
        select: { id: true },
      }),
    );
    if (out.kind === "created") {
      await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "task.created", entity: "Task", entityId: out.entityId });
    }
    revalidatePath("/tasks");
    revalidatePath("/dashboard");
    revalidatePath("/projects");
    return { id: out.entityId, message: "Task created" };
  });
}

/** Move a task to another status (inline select, mark done, reopen). */
export async function updateTaskStatus(fd: FormData) {
  return runAction("task:write", async (ctx) => {
    const id = fStr(fd, "id");
    const status = fStr(fd, "status");
    if (!isTaskStatus(status)) throw new Error("Pick a valid status.");
    const task = await prisma.task.findFirst({
      where: { id, orgId: ctx.orgId, OR: visibleTo(ctx.userId) },
      select: { id: true, title: true, status: true, projectId: true },
    });
    if (!task) throw new Error("Task not found.");
    if (task.status === status) return { id, message: "No change" };

    await prisma.task.update({ where: { id: task.id }, data: { status } });
    await audit({
      orgId: ctx.orgId,
      actorId: ctx.userId,
      action: "task.status",
      entity: "Task",
      entityId: task.id,
      meta: { from: task.status, to: status },
    });
    if (status === "DONE" && task.projectId) {
      await emitAutomationEvent({ trigger: "task.completed", subjectTitle: task.title, projectId: task.projectId, clientId: null });
    }
    revalidatePath("/tasks");
    revalidatePath("/dashboard");
    revalidatePath("/projects");
    return { id, message: "Updated" };
  });
}

export async function deleteTask(fd: FormData) {
  return runAction("task:write", async (ctx) => {
    const id = fStr(fd, "id");
    const task = await prisma.task.findFirst({
      where: { id, orgId: ctx.orgId, OR: visibleTo(ctx.userId) },
      select: { id: true },
    });
    if (!task) throw new Error("Task not found.");
    await prisma.task.delete({ where: { id: task.id } });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "task.deleted", entity: "Task", entityId: task.id });
    revalidatePath("/tasks");
    revalidatePath("/dashboard");
    revalidatePath("/projects");
    return { message: "Task deleted" };
  });
}
