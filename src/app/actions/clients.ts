"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { runAction, fStr, fOpt, fInt, fDate, fIk } from "@/lib/action";
import { planOf } from "@/lib/plans";
import { audit } from "@/lib/audit";
import { newPortalToken, hashToken } from "@/lib/tenancy";
import { withIdempotency } from "@/lib/idempotency";
import { appUrl } from "@/lib/mail";

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const clientSchema = z.object({
  name: z.string().trim().min(1, "Client name is required").max(120),
  company: z.string().trim().max(120).nullable(),
  industry: z.string().trim().max(80).nullable(),
  website: z.string().trim().max(200).nullable(),
  email: z.string().trim().email("Enter a valid email address").max(200).nullable(),
  phone: z.string().trim().max(40).nullable(),
  source: z.string().trim().max(80).nullable(),
  gstin: z.string().trim().regex(GSTIN_RE, "GSTIN must be 15 characters, e.g. 22AAAAA0000A1Z5").nullable(),
  paymentTermsDays: z.number().int().min(0, "Payment terms cannot be negative").max(365, "Payment terms must be 365 days or fewer"),
  billingAddress: z.string().trim().max(500).nullable(),
  state: z.string().trim().max(80).nullable(),
  city: z.string().trim().max(80).nullable(),
  pincode: z.string().trim().regex(/^[0-9]{6}$/, "Pincode must be 6 digits").nullable(),
  health: z.enum(["GOOD", "WATCH", "AT_RISK"]),
  status: z.enum(["ACTIVE", "ARCHIVED"]),
  nextFollowUpAt: z.date().nullable(),
  notes: z.string().trim().max(4000).nullable(),
});

type ClientInput = z.infer<typeof clientSchema>;

function normaliseWebsite(v: string | null): string | null {
  if (!v) return null;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

function parseClient(fd: FormData): ClientInput {
  const gstin = fOpt(fd, "gstin");
  return clientSchema.parse({
    name: fStr(fd, "name"),
    company: fOpt(fd, "company"),
    industry: fOpt(fd, "industry"),
    website: normaliseWebsite(fOpt(fd, "website")),
    email: fOpt(fd, "email"),
    phone: fOpt(fd, "phone"),
    source: fOpt(fd, "source"),
    gstin: gstin ? gstin.toUpperCase().replace(/\s+/g, "") : null,
    paymentTermsDays: fInt(fd, "paymentTermsDays", 15),
    billingAddress: fOpt(fd, "billingAddress"),
    state: fOpt(fd, "state"),
    city: fOpt(fd, "city"),
    pincode: fOpt(fd, "pincode"),
    health: fStr(fd, "health") || "GOOD",
    status: fStr(fd, "status") || "ACTIVE",
    nextFollowUpAt: fDate(fd, "nextFollowUpAt"),
    notes: fOpt(fd, "notes"),
  });
}

/** Plan entitlement: active-client cap (RULE-ENT-01). `excludeId` skips the client being edited. */
async function assertActiveClientRoom(orgId: string, excludeId?: string): Promise<void> {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { plan: true } });
  const plan = planOf(org?.plan);
  if (plan.maxActiveClients === null) return;
  const active = await prisma.client.count({
    where: { orgId, status: "ACTIVE", ...(excludeId ? { id: { not: excludeId } } : {}) },
  });
  if (active >= plan.maxActiveClients) {
    throw new Error(`Your ${plan.name} plan allows ${plan.maxActiveClients} active clients. Archive one or upgrade to add more.`);
  }
}

function revalidateClient(id?: string) {
  revalidatePath("/clients");
  if (id) revalidatePath(`/clients/${id}`);
}

export async function createClient(formData: FormData) {
  return runAction("client:write", async (ctx) => {
    const ik = fIk(formData);
    const data = parseClient(formData);
    if (data.status === "ACTIVE") await assertActiveClientRoom(ctx.orgId);

    const outcome = await withIdempotency(ctx.orgId, "client.create", ik, async (tx) =>
      tx.client.create({
        data: { orgId: ctx.orgId, ...data, portalToken: newPortalToken() },
        select: { id: true },
      }),
    );

    if (outcome.kind === "created") {
      await audit({
        orgId: ctx.orgId,
        actorId: ctx.userId,
        action: "client.created",
        entity: "Client",
        entityId: outcome.entityId,
        meta: { name: data.name },
      });
    }
    revalidateClient();
    return { id: outcome.entityId, message: "Client created", redirect: `/clients/${outcome.entityId}` };
  });
}

export async function updateClient(formData: FormData) {
  return runAction("client:write", async (ctx) => {
    const id = fStr(formData, "id");
    const existing = await prisma.client.findFirst({ where: { id, orgId: ctx.orgId }, select: { id: true, status: true } });
    if (!existing) throw new Error("Client not found");
    const data = parseClient(formData);
    if (data.status === "ACTIVE" && existing.status !== "ACTIVE") await assertActiveClientRoom(ctx.orgId, id);

    await prisma.client.update({ where: { id }, data });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "client.updated", entity: "Client", entityId: id, meta: { name: data.name } });
    revalidateClient(id);
    return { id, message: "Client updated" };
  });
}

async function setStatus(orgId: string, actorId: string, id: string, status: "ACTIVE" | "ARCHIVED") {
  const existing = await prisma.client.findFirst({ where: { id, orgId }, select: { id: true, status: true } });
  if (!existing) throw new Error("Client not found");
  if (existing.status === status) return;
  if (status === "ACTIVE") await assertActiveClientRoom(orgId, id);
  await prisma.client.update({ where: { id }, data: { status } });
  await audit({
    orgId,
    actorId,
    action: status === "ARCHIVED" ? "client.archived" : "client.restored",
    entity: "Client",
    entityId: id,
  });
  revalidateClient(id);
}

export async function archiveClient(formData: FormData) {
  return runAction("client:write", async (ctx) => {
    await setStatus(ctx.orgId, ctx.userId, fStr(formData, "id"), "ARCHIVED");
    return { message: "Client archived" };
  });
}

export async function restoreClient(formData: FormData) {
  return runAction("client:write", async (ctx) => {
    await setStatus(ctx.orgId, ctx.userId, fStr(formData, "id"), "ACTIVE");
    return { message: "Client restored" };
  });
}

export async function deleteClient(formData: FormData) {
  return runAction("client:delete", async (ctx) => {
    const id = fStr(formData, "id");
    const existing = await prisma.client.findFirst({
      where: { id, orgId: ctx.orgId },
      select: { id: true, name: true, _count: { select: { invoices: true } } },
    });
    if (!existing) throw new Error("Client not found");
    if (existing._count.invoices > 0) {
      throw new Error("This client has invoices, so it cannot be deleted. Archive it instead.");
    }
    await prisma.client.delete({ where: { id } });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "client.deleted", entity: "Client", entityId: id, meta: { name: existing.name } });
    revalidateClient();
    return { message: "Client deleted", redirect: "/clients" };
  });
}

const inviteSchema = z.object({
  clientId: z.string().min(1),
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().email("Enter a valid email address").max(200),
});

/** Invite someone to the client portal. The raw token is only ever shown once, in the returned message. */
export async function createPortalInvite(formData: FormData) {
  return runAction("client:write", async (ctx) => {
    const input = inviteSchema.parse({
      clientId: fStr(formData, "clientId"),
      name: fStr(formData, "name"),
      email: fStr(formData, "email").toLowerCase(),
    });
    const client = await prisma.client.findFirst({
      where: { id: input.clientId, orgId: ctx.orgId },
      select: { id: true, portalToken: true },
    });
    if (!client) throw new Error("Client not found");

    const raw = randomBytes(24).toString("hex");
    const invite = await prisma.portalInvite.create({
      data: {
        orgId: ctx.orgId,
        clientId: client.id,
        name: input.name,
        email: input.email,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + 7 * 86_400_000),
      },
      select: { id: true },
    });
    await audit({
      orgId: ctx.orgId,
      actorId: ctx.userId,
      action: "portal.invited",
      entity: "PortalInvite",
      entityId: invite.id,
      meta: { clientId: client.id },
    });
    revalidateClient(client.id);
    return {
      id: invite.id,
      message: `Invite saved for ${input.name}. Share this link (valid 7 days): ${appUrl()}/portal/${client.portalToken}?invite=${raw}`,
    };
  });
}

export async function revokePortalInvite(formData: FormData) {
  return runAction("client:write", async (ctx) => {
    const id = fStr(formData, "id");
    const invite = await prisma.portalInvite.findFirst({ where: { id, orgId: ctx.orgId }, select: { id: true, clientId: true } });
    if (!invite) throw new Error("Invite not found");
    await prisma.portalInvite.delete({ where: { id } });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "portal.invite_revoked", entity: "PortalInvite", entityId: id });
    revalidateClient(invite.clientId);
    return { message: "Invite revoked" };
  });
}

export async function addClientComment(formData: FormData) {
  return runAction("comms:write", async (ctx) => {
    const clientId = fStr(formData, "clientId");
    const body = z.string().trim().min(1, "Write something first").max(4000).parse(fStr(formData, "body"));
    const client = await prisma.client.findFirst({ where: { id: clientId, orgId: ctx.orgId }, select: { id: true } });
    if (!client) throw new Error("Client not found");
    const row = await prisma.comment.create({
      data: { orgId: ctx.orgId, authorId: ctx.userId, clientId, body },
      select: { id: true },
    });
    revalidateClient(clientId);
    return { id: row.id, message: "Comment added" };
  });
}

export async function listClients(orgId: string) {
  // Read path guard used by pages.
  return prisma.client.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
  });
}
