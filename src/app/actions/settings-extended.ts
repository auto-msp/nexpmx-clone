"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { employeeOf } from "@/lib/ai-team";
import { planOf } from "@/lib/plans";
import { requireEntitlement } from "@/lib/entitlements";
import { AI_TONES, AI_LANGUAGES, AI_PREF_KEYS } from "@/components/settings/ai-prefs";
import { runAction, fStr, fOpt, fBool, type ActionResult } from "@/lib/action";

/**
 * Workspace settings actions: company/GST profile, notification preferences,
 * AI preferences. Company + notifications are OWNER-only (org:manage); AI
 * preferences follow the AI module's write tier (automation:write). Audited.
 */

const companySchema = z.object({
  name: z.string().trim().min(1, "Workspace name is required").max(120),
  gstin: z.string().trim().max(20).optional(),
  addressLine: z.string().trim().max(200).optional(),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(80).optional(),
  postalCode: z.string().trim().max(12).optional(),
  country: z.string().trim().max(80).optional(),
  upiId: z.string().trim().max(100).optional(),
  upiPayeeName: z.string().trim().max(50).optional(),
});

export async function updateCompanyProfile(formData: FormData): Promise<ActionResult> {
  return runAction("org:manage", async (ctx) => {
    const parsed = companySchema.safeParse({
      name: fStr(formData, "name"),
      gstin: fOpt(formData, "gstin") ?? undefined,
      addressLine: fOpt(formData, "addressLine") ?? undefined,
      city: fOpt(formData, "city") ?? undefined,
      state: fOpt(formData, "state") ?? undefined,
      postalCode: fOpt(formData, "postalCode") ?? undefined,
      country: fOpt(formData, "country") ?? undefined,
      upiId: fOpt(formData, "upiId") ?? undefined,
      upiPayeeName: fOpt(formData, "upiPayeeName") ?? undefined,
    });
    if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join("; "));

    // GSTIN structure (15 chars: 2 digits + PAN + entity + Z + check) when present.
    const gstin = parsed.data.gstin?.toUpperCase() ?? "";
    if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(gstin)) {
      throw new Error("GSTIN looks malformed. Expected 15 characters like 22AAAAA0000A1Z5");
    }
    const upiId = parsed.data.upiId ?? "";
    if (upiId && !/^[a-zA-Z0-9.\-_]{2,64}@[a-zA-Z][a-zA-Z0-9.\-]{1,32}$/.test(upiId)) {
      throw new Error("UPI ID looks malformed. Expected a VPA like yourname@bank");
    }

    await prisma.organization.update({
      where: { id: ctx.orgId },
      data: {
        name: parsed.data.name,
        gstin: gstin || null,
        addressLine: parsed.data.addressLine ?? null,
        city: parsed.data.city ?? null,
        state: parsed.data.state ?? null,
        postalCode: parsed.data.postalCode ?? null,
        country: parsed.data.country || "India",
        upiId: upiId || null,
        upiPayeeName: parsed.data.upiPayeeName ?? null,
      },
    });
    await audit({
      orgId: ctx.orgId,
      actorId: ctx.userId,
      action: "org.profile_updated",
      entity: "Organization",
      entityId: ctx.orgId,
      meta: { gstin: gstin ? "set" : "cleared" },
    });

    revalidatePath("/settings/company");
    revalidatePath("/settings");
    return { message: "Company profile saved" };
  });
}

export async function updateNotificationPreferences(formData: FormData): Promise<ActionResult> {
  return runAction("org:manage", async (ctx) => {
    const data = {
      notifyPayments: fBool(formData, "notifyPayments"),
      notifyProposals: fBool(formData, "notifyProposals"),
      notifyMilestones: fBool(formData, "notifyMilestones"),
      notifyWeeklyDigest: fBool(formData, "notifyWeeklyDigest"),
    };
    await prisma.organization.update({ where: { id: ctx.orgId }, data });
    await audit({
      orgId: ctx.orgId,
      actorId: ctx.userId,
      action: "org.notifications_updated",
      entity: "Organization",
      entityId: ctx.orgId,
      meta: { ...data },
    });
    revalidatePath("/settings/notifications");
    return { message: "Notification preferences saved" };
  });
}

/* ── AI preferences ─────────────────────────────────────────────────────── */

const aiPrefsSchema = z.object({
  tone: z.enum(AI_TONES),
  language: z.enum(AI_LANGUAGES),
  guidance: z.string().trim().max(600, "Keep standing guidance under 600 characters").optional(),
});

export async function saveAiPreferences(formData: FormData): Promise<ActionResult> {
  return runAction("automation:write", async (ctx) => {
    const parsed = aiPrefsSchema.safeParse({
      tone: fStr(formData, "tone") || "professional",
      language: fStr(formData, "language") || "English (India)",
      guidance: fOpt(formData, "guidance") ?? undefined,
    });
    if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join("; "));

    const entries: Array<[string, string | null]> = [
      [AI_PREF_KEYS.tone, parsed.data.tone],
      [AI_PREF_KEYS.language, parsed.data.language],
      [AI_PREF_KEYS.guidance, parsed.data.guidance ?? null],
    ];
    for (const [factKey, value] of entries) {
      if (value === null) {
        await prisma.memoryFact.deleteMany({ where: { orgId: ctx.orgId, factKey } });
        continue;
      }
      await prisma.memoryFact.upsert({
        where: { orgId_factKey: { orgId: ctx.orgId, factKey } },
        create: { orgId: ctx.orgId, category: "settings", factKey, value, authorId: ctx.userId },
        update: { value, category: "settings", status: "ACTIVE" },
      });
    }
    await audit({
      orgId: ctx.orgId,
      actorId: ctx.userId,
      action: "ai.preferences_updated",
      entity: "Organization",
      entityId: ctx.orgId,
      meta: { tone: parsed.data.tone, language: parsed.data.language },
    });
    revalidatePath("/settings/ai");
    return { message: "AI preferences saved" };
  });
}

/** Enable/disable an AI employee. Enabling a paid employee is checked against remaining credits. */
export async function setAiEmployeeEnabled(formData: FormData): Promise<ActionResult> {
  return runAction("automation:write", async (ctx) => {
    await requireEntitlement(ctx.orgId);
    const key = fStr(formData, "key");
    const enable = fBool(formData, "enable");
    const def = employeeOf(key);
    if (!def) throw new Error("Unknown AI employee");

    if (enable) {
      const org = await prisma.organization.findUnique({ where: { id: ctx.orgId }, select: { aiCreditsUsed: true, plan: true } });
      if (!org) throw new Error("Workspace not found");
      const planCredits = planOf(org.plan).aiCreditsPerMonth;
      if (org.aiCreditsUsed + def.creditPrice > planCredits) {
        throw new Error(
          `Enabling ${def.name} adds ${def.creditPrice} credits a month and would exceed your plan's ${planCredits}. Upgrade or disable another employee first.`,
        );
      }
      await prisma.aiEmployee.upsert({
        where: { orgId_key: { orgId: ctx.orgId, key } },
        create: { orgId: ctx.orgId, key, enabled: true },
        update: { enabled: true },
      });
    } else {
      await prisma.aiEmployee.updateMany({ where: { orgId: ctx.orgId, key }, data: { enabled: false } });
    }
    await audit({
      orgId: ctx.orgId,
      actorId: ctx.userId,
      action: enable ? "ai.employee_enabled" : "ai.employee_disabled",
      entity: "AiEmployee",
      entityId: key,
      meta: enable ? { creditPrice: def.creditPrice } : undefined,
    });
    revalidatePath("/settings/ai");
    revalidatePath("/ai/team");
    revalidatePath("/ai");
    return { message: enable ? `${def.name} enabled` : `${def.name} disabled` };
  });
}
