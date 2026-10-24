"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { runAction, fStr, fOpt, fMoneyMinor, fDate, fBool, fIk } from "@/lib/action";
import { audit } from "@/lib/audit";
import { withIdempotency } from "@/lib/idempotency";
import { emitAutomationEvent } from "./automations";
import { memberUserId, optionalIk, ownedClientId, ownedProject, projectMilestoneId } from "@/components/projects/data";

const projectSchema = z
  .object({
    name: z.string().trim().min(1, "Project name is required").max(120),
    description: z.string().trim().max(4000).nullable(),
    projectType: z.enum(["FIXED_PRICE", "HOURLY", "RETAINER"]),
    status: z.enum(["PLANNING", "ACTIVE", "PAUSED", "COMPLETED"]),
    health: z.enum(["ON_TRACK", "WATCH", "AT_RISK"]),
    contractValueMinor: z.number().int().min(0, "Contract value cannot be negative").max(100_000_000_000_00),
    startDate: z.date().nullable(),
    deadline: z.date().nullable(),
    hideClient: z.boolean(),
  })
  .refine((v) => !v.startDate || !v.deadline || v.deadline >= v.startDate, {
    message: "Deadline must be on or after the start date",
    path: ["deadline"],
  });

function parseProject(fd: FormData) {
  return projectSchema.parse({
    name: fStr(fd, "name"),
    description: fOpt(fd, "description"),
    projectType: fStr(fd, "projectType") || "FIXED_PRICE",
    status: fStr(fd, "status") || "PLANNING",
    health: fStr(fd, "health") || "ON_TRACK",
    contractValueMinor: fMoneyMinor(fd, "contractValue"),
    startDate: fDate(fd, "startDate"),
    deadline: fDate(fd, "deadline"),
    hideClient: fBool(fd, "hideClient"),
  });
}

function revalidateProject(id?: string, clientId?: string | null) {
  revalidatePath("/projects");
  revalidatePath("/projects/breakdown");
  if (id) revalidatePath(`/projects/${id}`);
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

export async function createProject(formData: FormData) {
  return runAction("project:write", async (ctx) => {
    const ik = fIk(formData);
    const data = parseProject(formData);
    const clientId = await ownedClientId(ctx.orgId, fOpt(formData, "clientId"));

    const outcome = await withIdempotency(ctx.orgId, "project.create", ik, async (tx) =>
      tx.project.create({ data: { orgId: ctx.orgId, clientId, ...data }, select: { id: true } }),
    );

    if (outcome.kind === "created") {
      await audit({
        orgId: ctx.orgId,
        actorId: ctx.userId,
        action: "project.created",
        entity: "Project",
        entityId: outcome.entityId,
        meta: { name: data.name },
      });
      await emitAutomationEvent({ trigger: "project.created", subjectTitle: data.name, clientId, projectId: outcome.entityId });
    }
    revalidateProject(outcome.entityId, clientId);
    return { id: outcome.entityId, message: "Project created", redirect: `/projects/${outcome.entityId}` };
  });
}

export async function updateProject(formData: FormData) {
  return runAction("project:write", async (ctx) => {
    const id = fStr(formData, "id");
    const existing = await ownedProject(ctx.orgId, id);
    const data = parseProject(formData);
    const clientId = await ownedClientId(ctx.orgId, fOpt(formData, "clientId"));
    await prisma.project.update({ where: { id }, data: { clientId, ...data } });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "project.updated", entity: "Project", entityId: id, meta: { name: data.name } });
    revalidateProject(id, clientId);
    if (existing.clientId && existing.clientId !== clientId) revalidatePath(`/clients/${existing.clientId}`);
    return { id, message: "Project updated" };
  });
}

export async function updateProjectStatus(formData: FormData) {
  return runAction("project:write", async (ctx) => {
    const id = fStr(formData, "id");
    const status = z.enum(["PLANNING", "ACTIVE", "PAUSED", "COMPLETED"], { message: "Invalid status" }).parse(fStr(formData, "status"));
    const existing = await ownedProject(ctx.orgId, id);
    await prisma.project.update({ where: { id }, data: { status } });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "project.status_changed", entity: "Project", entityId: id, meta: { status } });
    revalidateProject(id, existing.clientId);
    return { message: "Status updated" };
  });
}

export async function deleteProject(formData: FormData) {
  return runAction("project:delete", async (ctx) => {
    const id = fStr(formData, "id");
    const existing = await ownedProject(ctx.orgId, id);
    await prisma.project.delete({ where: { id } });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "project.deleted", entity: "Project", entityId: id, meta: { name: existing.name } });
    revalidateProject(undefined, existing.clientId);
    return { message: "Project deleted", redirect: "/projects" };
  });
}

const taskSchema = z.object({
  title: z.string().trim().min(1, "Task title is required").max(200),
  description: z.string().trim().max(4000).nullable(),
  status: z.enum(["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  dueDate: z.date().nullable(),
});

export async function createTask(formData: FormData) {
  return runAction("task:write", async (ctx) => {
    const projectId = fStr(formData, "projectId");
    if (!projectId) throw new Error("Choose a project for this task");
    const project = await ownedProject(ctx.orgId, projectId);
    const data = taskSchema.parse({
      title: fStr(formData, "title"),
      description: fOpt(formData, "description"),
      status: fStr(formData, "status") || "TODO",
      priority: fStr(formData, "priority") || "MEDIUM",
      dueDate: fDate(formData, "dueDate"),
    });
    const assigneeId = await memberUserId(ctx.orgId, fOpt(formData, "assigneeId"));
    const milestoneId = await projectMilestoneId(ctx.orgId, project.id, fOpt(formData, "milestoneId"));

    const last = await prisma.task.aggregate({
      where: { orgId: ctx.orgId, projectId: project.id, status: data.status },
      _max: { position: true },
    });
    const position = (last._max.position ?? 0) + 1;

    const ik = optionalIk(formData);
    const make = (db: Pick<typeof prisma, "task">) =>
      db.task.create({
        data: { orgId: ctx.orgId, projectId: project.id, assigneeId, milestoneId, createdById: ctx.userId, position, ...data },
        select: { id: true },
      });
    let id: string;
    if (ik) {
      const outcome = await withIdempotency(ctx.orgId, "task.create", ik, (tx) => make(tx));
      id = outcome.entityId;
      if (outcome.kind === "created") {
        await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "task.created", entity: "Task", entityId: id, meta: { title: data.title } });
      }
    } else {
      id = (await make(prisma)).id;
      await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "task.created", entity: "Task", entityId: id, meta: { title: data.title } });
    }
    revalidateProject(project.id, project.clientId);
    revalidatePath("/tasks");
    return { id, message: "Task added" };
  });
}

export async function setTaskStatus(formData: FormData) {
  return runAction("task:write", async (ctx) => {
    const id = fStr(formData, "id");
    const status = z
      .enum(["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"], { message: "Invalid status" })
      .parse(fStr(formData, "status"));
    const task = await prisma.task.findFirst({ where: { id, orgId: ctx.orgId } });
    if (!task) throw new Error("Task not found");
    if (task.status === status) return { message: "No change" };

    await prisma.task.update({ where: { id }, data: { status } });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "task.status_changed", entity: "Task", entityId: id, meta: { status } });
    if (status === "DONE") {
      await emitAutomationEvent({ trigger: "task.completed", subjectTitle: task.title, projectId: task.projectId, clientId: null });
    }
    revalidateProject(task.projectId ?? undefined);
    revalidatePath("/tasks");
    return { message: "Task moved" };
  });
}
