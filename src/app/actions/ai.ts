"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireEntitlement } from "@/lib/entitlements";
import { runAction, fStr, fOpt, fIk, type ActionResult } from "@/lib/action";
import { withIdempotency } from "@/lib/idempotency";
import { planOf } from "@/lib/plans";
import { employeeOf } from "@/lib/ai-team";
import { loadTeam } from "@/components/ai/team-data";
import { buildContextAndAnswer } from "./assistant";

/**
 * AI module actions: team management (on/off, custom teammates, edits),
 * assigning a task, and the approval inbox. Every action RETURNS a result.
 *
 * Assigned tasks are stored as append-only audit rows (action
 * "ai.task_assigned", metaJson = {task, draft, …}); a later "ai.task_approved"
 * / "ai.task_dismissed" row with entityId = the task row's id is the review.
 * Pending = assigned rows with no review row.
 */

async function creditHeadroom(orgId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { aiCreditsUsed: true, plan: true },
  });
  if (!org) throw new Error("Workspace not found");
  const limit = planOf(org.plan).aiCreditsPerMonth;
  return { used: org.aiCreditsUsed, limit };
}

function revalidateAi() {
  revalidatePath("/ai/team");
  revalidatePath("/ai");
}

export async function toggleAiEmployee(fd: FormData): Promise<ActionResult> {
  return runAction("automation:write", async (ctx) => {
    await requireEntitlement(ctx.orgId);
    const key = fStr(fd, "key");
    const team = await loadTeam(ctx.orgId);
    const member = team.find((m) => m.key === key);
    if (!member) throw new Error("That teammate no longer exists.");

    if (member.enabled) {
      await prisma.aiEmployee.updateMany({ where: { orgId: ctx.orgId, key }, data: { enabled: false } });
      await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "ai.employee_disabled", entity: "AiEmployee", entityId: key });
      revalidateAi();
      return { message: `${member.name} is off duty.` };
    }

    if (member.creditPrice > 0) {
      const { used, limit } = await creditHeadroom(ctx.orgId);
      if (used + member.creditPrice > limit) {
        throw new Error(
          `Switching on ${member.name} adds ${member.creditPrice} credits a month and would pass your plan's ${limit}. Upgrade or switch someone off first.`,
        );
      }
    }
    await prisma.aiEmployee.upsert({
      where: { orgId_key: { orgId: ctx.orgId, key } },
      create: { orgId: ctx.orgId, key, enabled: true },
      update: { enabled: true },
    });
    await audit({
      orgId: ctx.orgId,
      actorId: ctx.userId,
      action: "ai.employee_enabled",
      entity: "AiEmployee",
      entityId: key,
      meta: { creditPrice: member.creditPrice },
    });
    revalidateAi();
    return { message: `${member.name} is on duty.` };
  });
}

const customSchema = z.object({
  name: z.string().trim().min(1, "Give your teammate a name").max(60),
  roleTitle: z.string().trim().min(1, "Add a role title").max(80),
  summary: z.string().trim().min(1, "Add a one-line summary").max(240),
  instructions: z.string().trim().max(4000).optional(),
});

export async function createCustomEmployee(fd: FormData): Promise<ActionResult> {
  return runAction("automation:write", async (ctx) => {
    await requireEntitlement(ctx.orgId);
    const ik = fIk(fd);
    const p = customSchema.parse({
      name: fStr(fd, "name"),
      roleTitle: fStr(fd, "roleTitle"),
      summary: fStr(fd, "summary"),
      instructions: fOpt(fd, "instructions") ?? undefined,
    });
    const count = await prisma.aiEmployee.count({ where: { orgId: ctx.orgId, custom: true } });
    if (count >= 20) throw new Error("You have reached 20 custom teammates. Remove one before adding another.");

    const out = await withIdempotency(ctx.orgId, "ai.employee.create", ik, (tx) =>
      tx.aiEmployee.create({
        data: {
          orgId: ctx.orgId,
          key: `custom-${ik.slice(0, 12)}`,
          enabled: true,
          custom: true,
          name: p.name,
          roleTitle: p.roleTitle,
          summary: p.summary,
          instructions: p.instructions ?? null,
        },
      }),
    );
    if (out.kind === "created") {
      await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "ai.employee_created", entity: "AiEmployee", entityId: out.entityId, meta: { name: p.name } });
    }
    revalidateAi();
    return { id: out.entityId, message: `${p.name} joined your AI team.` };
  });
}

export async function updateAiEmployee(fd: FormData): Promise<ActionResult> {
  return runAction("automation:write", async (ctx) => {
    await requireEntitlement(ctx.orgId);
    const key = fStr(fd, "key");
    const team = await loadTeam(ctx.orgId);
    const member = team.find((m) => m.key === key);
    if (!member) throw new Error("That teammate no longer exists.");

    if (member.custom) {
      const p = customSchema.parse({
        name: fStr(fd, "name"),
        roleTitle: fStr(fd, "roleTitle"),
        summary: fStr(fd, "summary"),
        instructions: fOpt(fd, "instructions") ?? undefined,
      });
      await prisma.aiEmployee.updateMany({
        where: { orgId: ctx.orgId, key, custom: true },
        data: { name: p.name, roleTitle: p.roleTitle, summary: p.summary, instructions: p.instructions ?? null },
      });
    } else {
      if (!employeeOf(key)) throw new Error("Unknown teammate.");
      const summary = z.string().trim().max(240).parse(fStr(fd, "summary"));
      const instructions = z.string().trim().max(4000).parse(fStr(fd, "instructions"));
      await prisma.aiEmployee.upsert({
        where: { orgId_key: { orgId: ctx.orgId, key } },
        create: { orgId: ctx.orgId, key, enabled: false, summary: summary || null, instructions: instructions || null },
        update: { summary: summary || null, instructions: instructions || null },
      });
    }
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "ai.employee_updated", entity: "AiEmployee", entityId: key });
    revalidateAi();
    return { message: "Saved." };
  });
}

export async function deleteCustomEmployee(fd: FormData): Promise<ActionResult> {
  return runAction("automation:write", async (ctx) => {
    const key = fStr(fd, "key");
    const res = await prisma.aiEmployee.deleteMany({ where: { orgId: ctx.orgId, key, custom: true } });
    if (res.count === 0) throw new Error("Only teammates you added yourself can be removed.");
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "ai.employee_deleted", entity: "AiEmployee", entityId: key });
    revalidateAi();
    return { message: "Teammate removed." };
  });
}

// ── Assign a task → draft → approval inbox ──────────────────────────────────

export async function assignAiTask(fd: FormData): Promise<ActionResult> {
  return runAction("task:write", async (ctx) => {
    await requireEntitlement(ctx.orgId);
    const key = fStr(fd, "key");
    const task = z.string().trim().min(5, "Describe the task in a few words").max(1000).parse(fStr(fd, "task"));

    const team = await loadTeam(ctx.orgId);
    const member = team.find((m) => m.key === key);
    if (!member) throw new Error("Pick a teammate first.");
    if (!member.enabled) throw new Error(`${member.name} is off duty. Switch them on before assigning work.`);

    const { used, limit } = await creditHeadroom(ctx.orgId);
    if (used >= limit) throw new Error("AI credit limit reached for this cycle. Upgrade your plan to continue.");

    // Ground the draft in the same workspace search the assistant uses.
    let found: string[] = [];
    let creditsFromAnswer = 0;
    try {
      const r = await buildContextAndAnswer(task);
      found = r.sources.map((s) => `[${s.kind}] ${s.title} — ${s.snippet}`);
      creditsFromAnswer = r.creditsUsed;
    } catch (err) {
      if (/credit limit/i.test((err as Error).message ?? "")) throw err;
      // Context search is best-effort; the draft still goes out without it.
    }

    const skills = await prisma.skill.findMany({
      where: { orgId: ctx.orgId, scope: "ALL" },
      select: { name: true, assignedJson: true },
    });
    const taught = skills
      .filter((s) => {
        try {
          const arr: unknown = JSON.parse(s.assignedJson);
          return Array.isArray(arr) && arr.includes(key);
        } catch {
          return false;
        }
      })
      .map((s) => s.name);

    const remit = member.custom
      ? member.instructions.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 4)
      : member.owns;

    const draft = [
      `Outline from ${member.name} (${member.role})`,
      "",
      `Task: ${task}`,
      "",
      found.length ? "What I found in your workspace:" : "I found nothing in your workspace that matches this yet.",
      ...found.slice(0, 5).map((f) => `• ${f}`),
      "",
      taught.length ? `Skills I would follow: ${taught.join(", ")}.` : "No skills taught to me yet — add some in the Skills library to shape the result.",
      remit.length ? "" : null,
      remit.length ? "Within my remit:" : null,
      ...remit.map((r) => `• ${r}`),
      "",
      "Next step: approve this outline to keep it, or dismiss it and assign a more specific task.",
    ]
      .filter((l): l is string => l !== null)
      .join("\n");

    const credits = creditsFromAnswer > 0 ? 0 : 1; // the answer already billed when it found context
    if (credits > 0) {
      const upd = await prisma.organization.updateMany({
        where: { id: ctx.orgId, aiCreditsUsed: { lt: limit } },
        data: { aiCreditsUsed: { increment: credits } },
      });
      if (upd.count === 0) throw new Error("AI credit limit reached for this cycle. Upgrade your plan to continue.");
      await prisma.usageEvent.create({ data: { orgId: ctx.orgId, kind: "ai.task", credits } });
    }

    const row = await prisma.auditLog.create({
      data: {
        orgId: ctx.orgId,
        actorId: ctx.userId,
        action: "ai.task_assigned",
        entity: "AiEmployee",
        entityId: key,
        metaJson: JSON.stringify({ employeeKey: key, employeeName: member.name, role: member.role, task, draft, found: found.length }),
      },
    });
    revalidateAi();
    return { id: row.id, message: `${member.name} drafted an outline. It is waiting in the approval inbox.` };
  });
}

export async function reviewAiTask(fd: FormData): Promise<ActionResult> {
  return runAction("task:write", async (ctx) => {
    const id = fStr(fd, "id");
    const decision = fStr(fd, "decision");
    if (decision !== "approved" && decision !== "dismissed") throw new Error("Unknown decision.");
    const task = await prisma.auditLog.findFirst({ where: { id, orgId: ctx.orgId, action: "ai.task_assigned" }, select: { id: true } });
    if (!task) throw new Error("That task no longer exists.");
    const done = await prisma.auditLog.findFirst({
      where: { orgId: ctx.orgId, entity: "AiTask", entityId: id },
      select: { id: true },
    });
    if (done) throw new Error("That task was already reviewed.");
    await prisma.auditLog.create({
      data: { orgId: ctx.orgId, actorId: ctx.userId, action: `ai.task_${decision}`, entity: "AiTask", entityId: id, metaJson: "{}" },
    });
    revalidateAi();
    return { message: decision === "approved" ? "Approved." : "Dismissed." };
  });
}
