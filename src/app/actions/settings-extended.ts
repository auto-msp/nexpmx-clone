"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireApiContext } from "@/lib/api";
import { requirePermission } from "@/lib/rbac";
import { audit } from "@/lib/audit";

/**
 * Extended settings actions: company/GST profile, notification preferences,
 * workspace identity. All OWNER/ADMIN-only (org:manage), audited.
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

export async function updateCompanyProfile(formData: FormData) {
  const ctx = await requireApiContext();
  requirePermission(ctx.role, "org:manage");

  const parsed = companySchema.safeParse({
    name: formData.get("name"),
    gstin: formData.get("gstin") || undefined,
    addressLine: formData.get("addressLine") || undefined,
    city: formData.get("city") || undefined,
    state: formData.get("state") || undefined,
    postalCode: formData.get("postalCode") || undefined,
    country: formData.get("country") || undefined,
    upiId: formData.get("upiId") || undefined,
    upiPayeeName: formData.get("upiPayeeName") || undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }

  // GSTIN is structurally validated (15 chars, 2 digits + PAN + entity code + Z
  // + check digit) only when non-empty; full checksum verification is a
  // residual item (KNOWN_LIMITATIONS).
  const gstin = parsed.data.gstin?.toUpperCase() ?? "";
  if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(gstin)) {
    throw new Error("GSTIN looks malformed — expected 15 characters like 22AAAAA0000A1Z5");
  }

  // UPI VPA format check when provided (name@bank).
  const upiId = parsed.data.upiId ?? "";
  if (upiId && !/^[a-zA-Z0-9.\-_]{2,64}@[a-zA-Z][a-zA-Z0-9.\-]{1,32}$/.test(upiId)) {
    throw new Error("UPI ID looks malformed — expected a VPA like yourname@bank");
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
}

const notificationsSchema = z.object({
  notifyPayments: z.boolean(),
  notifyProposals: z.boolean(),
  notifyMilestones: z.boolean(),
  notifyWeeklyDigest: z.boolean(),
});

export async function updateNotificationPreferences(formData: FormData) {
  const ctx = await requireApiContext();
  requirePermission(ctx.role, "org:manage");

  const parsed = notificationsSchema.safeParse({
    notifyPayments: formData.get("notifyPayments") === "on",
    notifyProposals: formData.get("notifyProposals") === "on",
    notifyMilestones: formData.get("notifyMilestones") === "on",
    notifyWeeklyDigest: formData.get("notifyWeeklyDigest") === "on",
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }

  await prisma.organization.update({
    where: { id: ctx.orgId },
    data: parsed.data,
  });

  await audit({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    action: "org.notifications_updated",
    entity: "Organization",
    entityId: ctx.orgId,
    meta: { ...parsed.data },
  });

  revalidatePath("/settings/notifications");
}
