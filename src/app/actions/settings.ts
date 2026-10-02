"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { requireApiContext } from "@/lib/api";
import { requirePermission } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { hashToken } from "@/lib/tenancy";
import { runAction, fStr, fOpt, fInt, type ActionResult } from "@/lib/action";

/**
 * Personal settings (profile) and API keys.
 */

const profileSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(80, "Name is too long"),
  designation: z.string().trim().max(80, "Designation is too long").optional(),
  phone: z
    .string()
    .trim()
    .max(24, "Phone number is too long")
    .regex(/^[0-9+()\-\s]*$/, "Phone can only contain digits, spaces, + ( ) and -")
    .optional(),
  weeklyCapacityHours: z.number().int().min(0, "Capacity cannot be negative").max(168, "A week has 168 hours"),
});

/** Update the signed-in user's own profile. Any member may edit themselves. */
export async function updateProfile(formData: FormData): Promise<ActionResult> {
  return runAction(null, async (ctx) => {
    const parsed = profileSchema.safeParse({
      name: fStr(formData, "name"),
      designation: fOpt(formData, "designation") ?? undefined,
      phone: fOpt(formData, "phone") ?? undefined,
      weeklyCapacityHours: fInt(formData, "weeklyCapacityHours", 40),
    });
    if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join("; "));

    await prisma.user.update({
      where: { id: ctx.userId },
      data: {
        name: parsed.data.name,
        designation: parsed.data.designation ?? null,
        phone: parsed.data.phone ?? null,
        weeklyCapacityHours: parsed.data.weeklyCapacityHours,
      },
    });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "user.profile_updated", entity: "User", entityId: ctx.userId });

    revalidatePath("/settings");
    revalidatePath("/settings/team");
    return { message: "Profile saved" };
  });
}

/**
 * Generate an API key (OWNER/ADMIN). Stored as a SHA-256 hash plus a display
 * prefix. The raw key is returned ONCE in the success message.
 */
export async function createApiKey(formData: FormData): Promise<ActionResult> {
  return runAction("org:invite", async (ctx) => {
    const name = (fStr(formData, "name") || "Default key").slice(0, 60);
    const raw = `bm_${randomBytes(24).toString("hex")}`;
    const prefix = raw.slice(0, 10);

    const key = await prisma.apiKey.create({
      data: { orgId: ctx.orgId, name, prefix, keyHash: hashToken(raw) },
    });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "apikey.created", entity: "ApiKey", entityId: key.id, meta: { prefix } });

    revalidatePath("/settings/privacy");
    return { id: key.id, message: `New key (copy it now, it is not shown again): ${raw}` };
  });
}

export async function revokeApiKey(formData: FormData): Promise<ActionResult> {
  return runAction("org:invite", async (ctx) => {
    const id = fStr(formData, "id");
    const key = await prisma.apiKey.findFirst({ where: { id, orgId: ctx.orgId, revokedAt: null }, select: { id: true, prefix: true } });
    if (!key) throw new Error("Key not found");
    await prisma.apiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "apikey.revoked", entity: "ApiKey", entityId: key.id, meta: { prefix: key.prefix } });
    revalidatePath("/settings/privacy");
    return { message: "Key revoked" };
  });
}

/** Legacy form action kept for compatibility; prefer createApiKey. */
export async function generateApiKeyAction() {
  const ctx = await requireApiContext();
  requirePermission(ctx.role, "org:invite");

  const raw = `bm_${randomBytes(24).toString("hex")}`;
  const prefix = raw.slice(0, 10);
  await prisma.apiKey.create({
    data: { orgId: ctx.orgId, name: "Default key", prefix, keyHash: hashToken(raw) },
  });
  await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "apikey.created", entity: "ApiKey", meta: { prefix } });
  revalidatePath("/settings/privacy");
}
