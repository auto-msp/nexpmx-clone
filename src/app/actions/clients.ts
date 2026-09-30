"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireApiContext } from "@/lib/api";
import { requirePermission } from "@/lib/rbac";
import { planOf } from "@/lib/plans";
import { audit } from "@/lib/audit";
import { newPortalToken } from "@/lib/tenancy";

const createClientSchema = z.object({
  name: z.string().trim().min(1, "Client name is required").max(120),
  company: z.string().trim().max(120).optional(),
  email: z.string().trim().email("Invalid email").max(200).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional(),
});

export async function createClient(formData: FormData) {
  const ctx = await requireApiContext();
  requirePermission(ctx.role, "client:write");

  const parsed = createClientSchema.safeParse({
    name: formData.get("name"),
    company: formData.get("company") || undefined,
    email: formData.get("email") || undefined,
    phone: formData.get("phone") || undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }

  const plan = planOf(
    (
      await prisma.organization.findUnique({
        where: { id: ctx.orgId },
        select: { plan: true },
      })
    )?.plan,
  );

  // Entitlement: active-client cap (Starter = 10). Business rule RULE-ENT-01.
  const activeClients = await prisma.client.count({
    where: { orgId: ctx.orgId, status: "ACTIVE" },
  });
  if (plan.maxActiveClients !== null && activeClients >= plan.maxActiveClients) {
    throw new Error(
      `Your ${plan.name} plan allows ${plan.maxActiveClients} active clients. Upgrade to add more.`,
    );
  }

  const client = await prisma.client.create({
    data: {
      orgId: ctx.orgId,
      name: parsed.data.name,
      company: parsed.data.company ?? null,
      email: parsed.data.email || null,
      phone: parsed.data.phone ?? null,
      portalToken: newPortalToken(),
    },
  });

  await audit({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    action: "client.created",
    entity: "Client",
    entityId: client.id,
    meta: { name: client.name },
  });

  revalidatePath("/clients");
}

export async function archiveClient(formData: FormData) {
  const ctx = await requireApiContext();
  requirePermission(ctx.role, "client:write");

  const id = String(formData.get("id") ?? "");
  const existing = await prisma.client.findFirst({
    where: { id, orgId: ctx.orgId },
  });
  if (!existing) throw new Error("Client not found");

  await prisma.client.update({ where: { id }, data: { status: "ARCHIVED" } });
  await audit({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    action: "client.archived",
    entity: "Client",
    entityId: id,
  });
  revalidatePath("/clients");
}

export async function listClients(orgId: string) {
  // Read path guard used by pages.
  return prisma.client.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
  });
}
