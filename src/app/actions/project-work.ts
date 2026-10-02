"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { runAction, fStr, fOpt, fMoneyMinor, fDate, fBool } from "@/lib/action";
import { audit } from "@/lib/audit";
import { emitAutomationEvent } from "./automations";
import { memberUserId, ownedProject, projectMilestoneId } from "@/components/projects/data";

function refresh(projectId?: string | null, clientId?: string | null) {
  revalidatePath("/projects");
  revalidatePath("/projects/breakdown");
  revalidatePath("/tasks");
  if (projectId) revalidatePath(`/projects/${projectId}`);
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

/* ── Milestones ─────────────────────────────────────────────────────────── */

const milestoneSchema = z.object({
  name: z.string().trim().min(1, "Milestone name is required").max(160),
  dueDate: z.date().nullable(),
});

export async function createMilestone(formData: FormData) {
  return runAction("project:write", async (ctx) => {
    const project = await ownedProject(ctx.orgId, fStr(formData, "projectId"));
    const data = milestoneSchema.parse({ name: fStr(formData, "name"), dueDate: fDate(formData, "dueDate") });
    const count = await prisma.milestone.count({ where: { orgId: ctx.orgId, projectId: project.id } });
    const row = await prisma.milestone.create({
      data: { orgId: ctx.orgId, projectId: project.id, position: count, ...data },
      select: { id: true },
    });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "milestone.created", entity: "Milestone", entityId: row.id, meta: { name: data.name } });
    refresh(project.id);
    return { id: row.id, message: "Milestone added" };
  });
}

async function ownedMilestone(orgId: string, id: string) {
  const m = await prisma.milestone.findFirst({ where: { id, orgId }, include: { project: { select: { id: true, name: true, clientId: true } } } });
  if (!m) throw new Error("Milestone not found");
  return m;
}

export async function updateMilestone(formData: FormData) {
  return runAction("project:write", async (ctx) => {
    const m = await ownedMilestone(ctx.orgId, fStr(formData, "id"));
    const data = milestoneSchema.parse({ name: fStr(formData, "name"), dueDate: fDate(formData, "dueDate") });
    await prisma.milestone.update({ where: { id: m.id }, data });
    refresh(m.projectId);
    return { message: "Milestone updated" };
  });
}

export async function toggleMilestone(formData: FormData) {
  return runAction("project:write", async (ctx) => {
    const m = await ownedMilestone(ctx.orgId, fStr(formData, "id"));
    const completing = !m.completedAt;
    await prisma.milestone.update({ where: { id: m.id }, data: { completedAt: completing ? new Date() : null } });
    await audit({
      orgId: ctx.orgId,
      actorId: ctx.userId,
      action: completing ? "milestone.completed" : "milestone.reopened",
      entity: "Milestone",
      entityId: m.id,
      meta: { name: m.name },
    });
    if (completing) {
      await emitAutomationEvent({ trigger: "milestone.completed", subjectTitle: m.name, clientId: m.project.clientId, projectId: m.projectId });
    }
    refresh(m.projectId, m.project.clientId);
    return { message: completing ? "Milestone completed" : "Milestone reopened" };
  });
}

export async function deleteMilestone(formData: FormData) {
  return runAction("project:write", async (ctx) => {
    const m = await ownedMilestone(ctx.orgId, fStr(formData, "id"));
    await prisma.milestone.delete({ where: { id: m.id } });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "milestone.deleted", entity: "Milestone", entityId: m.id, meta: { name: m.name } });
    refresh(m.projectId);
    return { message: "Milestone removed. Its tasks are now unassigned." };
  });
}

/* ── Tasks (edit / delete / move) ───────────────────────────────────────── */

const taskEditSchema = z.object({
  title: z.string().trim().min(1, "Task title is required").max(200),
  description: z.string().trim().max(4000).nullable(),
  status: z.enum(["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  dueDate: z.date().nullable(),
});

async function ownedTask(orgId: string, id: string) {
  const t = await prisma.task.findFirst({ where: { id, orgId } });
  if (!t) throw new Error("Task not found");
  return t;
}

export async function updateTask(formData: FormData) {
  return runAction("task:write", async (ctx) => {
    const task = await ownedTask(ctx.orgId, fStr(formData, "id"));
    const data = taskEditSchema.parse({
      title: fStr(formData, "title"),
      description: fOpt(formData, "description"),
      status: fStr(formData, "status") || task.status,
      priority: fStr(formData, "priority") || task.priority,
      dueDate: fDate(formData, "dueDate"),
    });
    const assigneeId = await memberUserId(ctx.orgId, fOpt(formData, "assigneeId"));
    const milestoneId = await projectMilestoneId(ctx.orgId, task.projectId, fOpt(formData, "milestoneId"));
    await prisma.task.update({ where: { id: task.id }, data: { ...data, assigneeId, milestoneId } });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "task.updated", entity: "Task", entityId: task.id, meta: { title: data.title } });
    if (data.status === "DONE" && task.status !== "DONE") {
      await emitAutomationEvent({ trigger: "task.completed", subjectTitle: data.title, projectId: task.projectId, clientId: null });
    }
    refresh(task.projectId);
    return { message: "Task updated" };
  });
}

export async function deleteTask(formData: FormData) {
  return runAction("task:write", async (ctx) => {
    const task = await ownedTask(ctx.orgId, fStr(formData, "id"));
    await prisma.task.delete({ where: { id: task.id } });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "task.deleted", entity: "Task", entityId: task.id, meta: { title: task.title } });
    refresh(task.projectId);
    return { message: "Task deleted" };
  });
}

/** Change status and/or milestone in one go (used by the task breakdown matrix). */
export async function moveTask(formData: FormData) {
  return runAction("task:write", async (ctx) => {
    const task = await ownedTask(ctx.orgId, fStr(formData, "id"));
    const rawStatus = fStr(formData, "status");
    const status = rawStatus
      ? z.enum(["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"]).parse(rawStatus)
      : task.status;
    const milestoneId = formData.has("milestoneId")
      ? await projectMilestoneId(ctx.orgId, task.projectId, fOpt(formData, "milestoneId"))
      : task.milestoneId;
    await prisma.task.update({ where: { id: task.id }, data: { status, milestoneId } });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "task.moved", entity: "Task", entityId: task.id, meta: { status, milestoneId } });
    if (status === "DONE" && task.status !== "DONE") {
      await emitAutomationEvent({ trigger: "task.completed", subjectTitle: task.title, projectId: task.projectId, clientId: null });
    }
    refresh(task.projectId);
    return { message: "Task moved" };
  });
}

/* ── Expenses ───────────────────────────────────────────────────────────── */

const expenseSchema = z.object({
  category: z.string().trim().min(1, "Category is required").max(60),
  description: z.string().trim().min(1, "Description is required").max(300),
  amountMinor: z.number().int().min(1, "Enter an amount above zero").max(100_000_000_000_00),
  spentOn: z.date(),
  gstDeductible: z.boolean(),
});

export async function logProjectExpense(formData: FormData) {
  return runAction("project:write", async (ctx) => {
    const project = await ownedProject(ctx.orgId, fStr(formData, "projectId"));
    const data = expenseSchema.parse({
      category: fStr(formData, "category"),
      description: fStr(formData, "description"),
      amountMinor: fMoneyMinor(formData, "amount"),
      spentOn: fDate(formData, "spentOn") ?? new Date(),
      gstDeductible: fBool(formData, "gstDeductible"),
    });
    const row = await prisma.expense.create({
      data: { orgId: ctx.orgId, projectId: project.id, loggedById: ctx.userId, ...data },
      select: { id: true },
    });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "expense.logged", entity: "Expense", entityId: row.id, meta: { projectId: project.id } });
    refresh(project.id);
    revalidatePath("/expenses");
    revalidatePath("/finance");
    return { id: row.id, message: "Expense logged" };
  });
}

export async function deleteProjectExpense(formData: FormData) {
  return runAction("project:write", async (ctx) => {
    const id = fStr(formData, "id");
    const e = await prisma.expense.findFirst({ where: { id, orgId: ctx.orgId }, select: { id: true, projectId: true } });
    if (!e) throw new Error("Expense not found");
    await prisma.expense.delete({ where: { id } });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "expense.deleted", entity: "Expense", entityId: id });
    refresh(e.projectId);
    revalidatePath("/expenses");
    revalidatePath("/finance");
    return { message: "Expense removed" };
  });
}

/* ── Decisions & comments ───────────────────────────────────────────────── */

export async function createProjectDecision(formData: FormData) {
  return runAction("decision:write", async (ctx) => {
    const project = await ownedProject(ctx.orgId, fStr(formData, "projectId"));
    const data = z
      .object({
        title: z.string().trim().min(1, "Give the decision a title").max(200),
        body: z.string().trim().min(1, "Describe what was decided and why").max(8000),
      })
      .parse({ title: fStr(formData, "title"), body: fStr(formData, "body") });
    const row = await prisma.decision.create({
      data: { orgId: ctx.orgId, authorId: ctx.userId, projectId: project.id, clientId: project.clientId, ...data },
      select: { id: true },
    });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "decision.created", entity: "Decision", entityId: row.id, meta: { projectId: project.id } });
    refresh(project.id);
    revalidatePath("/decisions");
    return { id: row.id, message: "Decision recorded" };
  });
}

export async function addProjectComment(formData: FormData) {
  return runAction("comms:write", async (ctx) => {
    const project = await ownedProject(ctx.orgId, fStr(formData, "projectId"));
    const body = z.string().trim().min(1, "Write something first").max(4000).parse(fStr(formData, "body"));
    const row = await prisma.comment.create({
      data: { orgId: ctx.orgId, authorId: ctx.userId, projectId: project.id, body },
      select: { id: true },
    });
    refresh(project.id);
    return { id: row.id, message: "Comment added" };
  });
}
