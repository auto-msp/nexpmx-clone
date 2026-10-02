"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireEntitlement } from "@/lib/entitlements";
import { runAction, fStr, fOpt, fIk, type ActionResult } from "@/lib/action";
import { withIdempotency } from "@/lib/idempotency";
import { skillOf } from "@/lib/skills";
import { AI_EMPLOYEES } from "@/lib/ai-team";

/**
 * Skills library actions. A "skill" is a Skill row: instructions the chosen
 * AI employees follow, optionally limited to one client or project. Ready-made
 * skills are copied into a row when taught (matched later by name).
 */

async function validEmployeeKeys(orgId: string): Promise<Set<string>> {
  const custom = await prisma.aiEmployee.findMany({ where: { orgId, custom: true }, select: { key: true } });
  return new Set([...AI_EMPLOYEES.map((e) => e.key), ...custom.map((c) => c.key)]);
}

function pickEmployees(fd: FormData, valid: Set<string>): string[] {
  const keys = fd.getAll("emp").map((v) => String(v)).filter((k) => valid.has(k));
  return [...new Set(keys)];
}

const skillSchema = z.object({
  name: z.string().trim().min(1, "Give the skill a name").max(120),
  description: z.string().trim().max(240).optional(),
  instructions: z.string().trim().min(10, "Add the instructions the team should follow").max(8000),
  scope: z.enum(["ALL", "CLIENT", "PROJECT"]).default("ALL"),
});

async function resolveScope(orgId: string, fd: FormData, scope: "ALL" | "CLIENT" | "PROJECT"): Promise<string | null> {
  if (scope === "CLIENT") {
    const id = fStr(fd, "clientId");
    if (!id) throw new Error("Choose which client this skill applies to.");
    const c = await prisma.client.findFirst({ where: { id, orgId }, select: { id: true } });
    if (!c) throw new Error("Client not found.");
    return c.id;
  }
  if (scope === "PROJECT") {
    const id = fStr(fd, "projectId");
    if (!id) throw new Error("Choose which project this skill applies to.");
    const p = await prisma.project.findFirst({ where: { id, orgId }, select: { id: true } });
    if (!p) throw new Error("Project not found.");
    return p.id;
  }
  return null;
}

function revalidateSkills() {
  revalidatePath("/ai/skills");
  revalidatePath("/ai/team");
}

/** "+ Add to my AI team" on a ready-made skill (also re-teaches an installed one). */
export async function teachReadySkill(fd: FormData): Promise<ActionResult> {
  return runAction("automation:write", async (ctx) => {
    await requireEntitlement(ctx.orgId);
    const def = skillOf(fStr(fd, "skillId"));
    if (!def) throw new Error("That skill is no longer in the library.");
    const emps = pickEmployees(fd, await validEmployeeKeys(ctx.orgId));
    if (emps.length === 0) throw new Error("Choose at least one teammate to teach.");

    const existing = await prisma.skill.findFirst({ where: { orgId: ctx.orgId, name: def.title }, select: { id: true } });
    if (existing) {
      await prisma.skill.update({ where: { id: existing.id }, data: { assignedJson: JSON.stringify(emps) } });
    } else {
      await prisma.skill.create({
        data: {
          orgId: ctx.orgId,
          name: def.title,
          description: def.description,
          instructions: def.instructions,
          scope: "ALL",
          assignedJson: JSON.stringify(emps),
        },
      });
    }
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "skill.taught", entity: "Skill", entityId: def.id, meta: { employees: emps.length } });
    revalidateSkills();
    return { message: `Taught "${def.title}".` };
  });
}

export async function createSkill(fd: FormData): Promise<ActionResult> {
  return runAction("automation:write", async (ctx) => {
    await requireEntitlement(ctx.orgId);
    const ik = fIk(fd);
    const p = skillSchema.parse({
      name: fStr(fd, "name"),
      description: fOpt(fd, "description") ?? undefined,
      instructions: fStr(fd, "instructions"),
      scope: fStr(fd, "scope") || "ALL",
    });
    const scopeId = await resolveScope(ctx.orgId, fd, p.scope);
    const emps = pickEmployees(fd, await validEmployeeKeys(ctx.orgId));

    const out = await withIdempotency(ctx.orgId, "skill.create", ik, (tx) =>
      tx.skill.create({
        data: {
          orgId: ctx.orgId,
          name: p.name,
          description: p.description ?? null,
          instructions: p.instructions,
          scope: p.scope,
          scopeId,
          assignedJson: JSON.stringify(emps),
        },
      }),
    );
    if (out.kind === "created") {
      await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "skill.created", entity: "Skill", entityId: out.entityId, meta: { name: p.name, scope: p.scope } });
    }
    revalidateSkills();
    return { id: out.entityId, message: "Skill created.", redirect: "/ai/skills?tab=yours" };
  });
}

export async function updateSkill(fd: FormData): Promise<ActionResult> {
  return runAction("automation:write", async (ctx) => {
    await requireEntitlement(ctx.orgId);
    const id = fStr(fd, "id");
    const skill = await prisma.skill.findFirst({ where: { id, orgId: ctx.orgId } });
    if (!skill) throw new Error("Skill not found.");
    const p = skillSchema.parse({
      name: fStr(fd, "name"),
      description: fOpt(fd, "description") ?? undefined,
      instructions: fStr(fd, "instructions"),
      scope: fStr(fd, "scope") || "ALL",
    });
    const scopeId = await resolveScope(ctx.orgId, fd, p.scope);
    const emps = pickEmployees(fd, await validEmployeeKeys(ctx.orgId));

    const changed =
      skill.name !== p.name ||
      (skill.description ?? "") !== (p.description ?? "") ||
      skill.instructions !== p.instructions ||
      skill.scope !== p.scope ||
      (skill.scopeId ?? null) !== scopeId;
    await prisma.skill.update({
      where: { id },
      data: {
        name: p.name,
        description: p.description ?? null,
        instructions: p.instructions,
        scope: p.scope,
        scopeId,
        assignedJson: JSON.stringify(emps),
        ...(changed ? { version: { increment: 1 } } : {}),
      },
    });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "skill.updated", entity: "Skill", entityId: id, meta: { versionBumped: changed } });
    revalidateSkills();
    return { message: changed ? `Saved as version ${skill.version + 1}.` : "Saved." };
  });
}

export async function deleteSkill(fd: FormData): Promise<ActionResult> {
  return runAction("automation:write", async (ctx) => {
    const id = fStr(fd, "id");
    const skill = await prisma.skill.findFirst({ where: { id, orgId: ctx.orgId }, select: { id: true, name: true } });
    if (!skill) throw new Error("Skill not found.");
    await prisma.skill.delete({ where: { id } });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "skill.deleted", entity: "Skill", entityId: id, meta: { name: skill.name } });
    revalidateSkills();
    return { message: "Skill removed." };
  });
}
