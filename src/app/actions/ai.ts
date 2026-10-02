"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireApiContext } from "@/lib/api";
import { requirePermission } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { requireEntitlement } from "@/lib/entitlements";
import { employeeOf } from "@/lib/ai-team";
import { skillOf } from "@/lib/skills";

/**
 * AI module actions: AI team management (enable/disable virtual employees)
 * and skills (install ready-made, create custom). Enabling paid employees
 * is guarded by the org's remaining AI credits so the rate card is honest.
 */

async function assertAiCreditsFor(orgId: string, extraMonthly: number) {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { aiCreditsUsed: true, plan: true },
  });
  if (!org) throw new Error("Organization not found");
  const planCredits = { STARTER: 1000, GROWTH: 2500, SCALE: 10000 }[org.plan] ?? 1000;
  if (org.aiCreditsUsed + extraMonthly > planCredits) {
    throw new Error(
      `Enabling this adds ${extraMonthly} credits/month and would exceed your plan's ${planCredits}. Upgrade or disable another employee first.`,
    );
  }
}

export async function toggleAiEmployee(formData: FormData) {
  const ctx = await requireApiContext();
  requirePermission(ctx.role, "automation:write"); // AI module = admin surface
  await requireEntitlement(ctx.orgId);

  const key = String(formData.get("key") ?? "");
  const def = employeeOf(key);
  if (!def) throw new Error("Unknown AI employee");

  const existing = await prisma.aiEmployee.findUnique({
    where: { orgId_key: { orgId: ctx.orgId, key } },
  });

  if (existing?.enabled) {
    await prisma.aiEmployee.update({ where: { id: existing.id }, data: { enabled: false } });
    await audit({
      orgId: ctx.orgId,
      actorId: ctx.userId,
      action: "ai.employee_disabled",
      entity: "AiEmployee",
      entityId: key,
    });
  } else {
    await assertAiCreditsFor(ctx.orgId, def.creditPrice);
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
      meta: { creditPrice: def.creditPrice },
    });
  }

  revalidatePath("/ai/team");
  revalidatePath("/ai");
}

const customSkillSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120),
  category: z.string().trim().max(40).default("OPERATIONS"),
  instructions: z.string().trim().min(1, "Instructions are required").max(5000),
  taughtTo: z.string().trim().max(200).optional(), // comma-separated keys
});

export async function createCustomSkill(formData: FormData) {
  const ctx = await requireApiContext();
  requirePermission(ctx.role, "automation:write");
  await requireEntitlement(ctx.orgId);

  const parsed = customSkillSchema.safeParse({
    title: formData.get("title"),
    category: formData.get("category") || "OPERATIONS",
    instructions: formData.get("instructions"),
    taughtTo: formData.get("taughtTo") || undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }

  const skill = await prisma.usageEvent.create({
    data: {
      orgId: ctx.orgId,
      kind: "ai.custom_skill",
      credits: 0,
    },
  });
  void skill;

  // Custom skills persist as audited memory facts under the "skills" family:
  // they are house process, i.e. business memory by definition.
  const factKey = `skill-${parsed.data.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 70)}`;

  await prisma.memoryFact.upsert({
    where: { orgId_factKey: { orgId: ctx.orgId, factKey } },
    create: {
      orgId: ctx.orgId,
      category: "team",
      factKey,
      value: parsed.data.instructions,
      authorId: ctx.userId,
    },
    update: { value: parsed.data.instructions },
  });

  await audit({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    action: "ai.custom_skill_created",
    entity: "MemoryFact",
    entityId: factKey,
    meta: { title: parsed.data.title, taughtTo: parsed.data.taughtTo ?? "" },
  });

  revalidatePath("/ai/skills");
}

export async function addReadySkillToTeam(formData: FormData) {
  const ctx = await requireApiContext();
  requirePermission(ctx.role, "automation:write");
  await requireEntitlement(ctx.orgId);

  const id = String(formData.get("skillId") ?? "");
  const skill = skillOf(id);
  if (!skill) throw new Error("Unknown skill");

  await prisma.memoryFact.upsert({
    where: { orgId_factKey: { orgId: ctx.orgId, factKey: `skill-${skill.id}` } },
    create: {
      orgId: ctx.orgId,
      category: "team",
      factKey: `skill-${skill.id}`,
      value: skill.instructions,
      authorId: ctx.userId,
    },
    update: { value: skill.instructions },
  });

  await audit({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    action: "ai.skill_added",
    entity: "MemoryFact",
    entityId: skill.id,
    meta: { title: skill.title, taughtTo: skill.taughtTo.join(",") },
  });

  revalidatePath("/ai/skills");
}
