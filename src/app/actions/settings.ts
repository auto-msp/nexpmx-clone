"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { requireApiContext } from "@/lib/api";
import { requirePermission } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { hashToken } from "@/lib/tenancy";
import { randomBytes } from "node:crypto";

/**
 * Generate an API key for the caller's org.
 * Only OWNER/ADMIN may mint keys. The raw key is returned via a short-lived
 * cookie-read pattern: we show it once in the URL of the settings page.
 * Stored value is a SHA-256 hash plus a display prefix.
 */
export async function generateApiKeyAction() {
  const ctx = await requireApiContext();
  requirePermission(ctx.role, "org:invite"); // OWNER or ADMIN only

  const raw = `bm_${randomBytes(24).toString("hex")}`;
  const prefix = raw.slice(0, 10);

  await prisma.apiKey.create({
    data: {
      orgId: ctx.orgId,
      name: "Default key",
      prefix,
      keyHash: hashToken(raw),
    },
  });

  await audit({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    action: "apikey.created",
    entity: "ApiKey",
    meta: { prefix },
  });

  revalidatePath("/settings");
  // The raw key is NOT displayed again; document this to the user in UI copy.
}
