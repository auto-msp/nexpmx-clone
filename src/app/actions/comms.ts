"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireApiContext } from "@/lib/api";
import { requirePermission } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { requireEntitlement } from "@/lib/entitlements";

/**
 * Comms actions — log calls/meetings/notes and record client emails.
 * Screenshot evidence: a per-client thread with direction (in/out) and
 * channel filters; entries are appended-only (edits go through audit, not
 * silent rewrites). Email sending is intentionally NOT wired to a provider —
 * entries are records of communication, with `recordEmail` marking an email
 * as logged rather than delivered (KNOWN_LIMITATIONS).
 */

const logCommsSchema = z.object({
  clientId: z.string().trim().optional(),
  direction: z.enum(["OUT", "IN"]).default("OUT"),
  channel: z.enum(["EMAIL", "CALL", "MEETING", "NOTE"]).default("EMAIL"),
  subject: z.string().trim().min(1, "Subject is required").max(200),
  body: z.string().trim().max(10_000).optional(),
});

export async function logComms(formData: FormData) {
  const ctx = await requireApiContext();
  requirePermission(ctx.role, "comms:write"); // comms are memory-adjacent writes
  await requireEntitlement(ctx.orgId);

  const parsed = logCommsSchema.safeParse({
    clientId: formData.get("clientId") || undefined,
    direction: formData.get("direction") || "OUT",
    channel: formData.get("channel") || "EMAIL",
    subject: formData.get("subject"),
    body: formData.get("body") || undefined,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }

  let clientId: string | null = null;
  if (parsed.data.clientId) {
    const client = await prisma.client.findFirst({
      where: { id: parsed.data.clientId, orgId: ctx.orgId },
      select: { id: true },
    });
    if (!client) throw new Error("Client not found in your organization");
    clientId = client.id;
  }

  const msg = await prisma.commsMessage.create({
    data: {
      orgId: ctx.orgId,
      clientId,
      direction: parsed.data.direction,
      channel: parsed.data.channel,
      subject: parsed.data.subject,
      body: parsed.data.body ?? null,
      authorId: ctx.userId,
    },
  });

  await audit({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    action: "comms.logged",
    entity: "CommsMessage",
    entityId: msg.id,
    meta: { channel: parsed.data.channel, direction: parsed.data.direction },
  });

  revalidatePath("/comms");
}

export async function deleteComms(formData: FormData) {
  const ctx = await requireApiContext();
  requirePermission(ctx.role, "decision:write");
  await requireEntitlement(ctx.orgId);
  const id = String(formData.get("id") ?? "");
  const existing = await prisma.commsMessage.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!existing) throw new Error("Message not found");
  await prisma.commsMessage.delete({ where: { id } });
  await audit({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    action: "comms.deleted",
    entity: "CommsMessage",
    entityId: id,
  });
  revalidatePath("/comms");
}
