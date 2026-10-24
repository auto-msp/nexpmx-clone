"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireEntitlement } from "@/lib/entitlements";
import { withIdempotency } from "@/lib/idempotency";
import { runAction, fStr, fOpt, fDate, fIk, type ActionResult } from "@/lib/action";

/**
 * Comms actions — log calls, meetings, notes and emails against a client.
 * Entries are records of communication (no provider delivers anything), so a
 * correction means deleting and re-logging; both steps are audited.
 */

const logCommsSchema = z.object({
  clientId: z.string().trim().optional(),
  direction: z.enum(["OUT", "IN"]).default("OUT"),
  channel: z.enum(["EMAIL", "CALL", "MEETING", "NOTE"]).default("EMAIL"),
  subject: z.string().trim().min(1, "Subject is required").max(200),
  body: z.string().trim().max(10_000).optional(),
});

export async function logComms(formData: FormData): Promise<ActionResult> {
  return runAction("comms:write", async (ctx) => {
    await requireEntitlement(ctx.orgId);

    const parsed = logCommsSchema.safeParse({
      clientId: fOpt(formData, "clientId") ?? undefined,
      direction: fStr(formData, "direction") || "OUT",
      channel: fStr(formData, "channel") || "EMAIL",
      subject: fStr(formData, "subject"),
      body: fOpt(formData, "body") ?? undefined,
    });
    if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join("; "));

    let clientId: string | null = null;
    if (parsed.data.clientId) {
      const client = await prisma.client.findFirst({
        where: { id: parsed.data.clientId, orgId: ctx.orgId },
        select: { id: true },
      });
      if (!client) throw new Error("Client not found in your workspace");
      clientId = client.id;
    }

    // Occurred-at date (defaults to now). Future dates are clamped to now.
    const when = fDate(formData, "sentAt");
    const today = new Date().toISOString().slice(0, 10);
    const sentAt = when && when.toISOString().slice(0, 10) < today ? when : new Date();

    const ik = fIk(formData);
    const out = await withIdempotency(ctx.orgId, "comms.log", ik, (tx) =>
      tx.commsMessage.create({
        data: {
          orgId: ctx.orgId,
          clientId,
          direction: parsed.data.direction,
          channel: parsed.data.channel,
          subject: parsed.data.subject,
          body: parsed.data.body ?? null,
          authorId: ctx.userId,
          sentAt,
        },
      }),
    );

    if (out.kind === "created") {
      await audit({
        orgId: ctx.orgId,
        actorId: ctx.userId,
        action: "comms.logged",
        entity: "CommsMessage",
        entityId: out.entityId,
        meta: { channel: parsed.data.channel, direction: parsed.data.direction },
      });
    }

    revalidatePath("/comms");
    return { id: out.entityId, message: "Logged" };
  });
}

export async function deleteComms(formData: FormData): Promise<ActionResult> {
  return runAction("comms:write", async (ctx) => {
    await requireEntitlement(ctx.orgId);
    const id = fStr(formData, "id");
    const existing = await prisma.commsMessage.findFirst({ where: { id, orgId: ctx.orgId }, select: { id: true } });
    if (!existing) throw new Error("Message not found");
    await prisma.commsMessage.delete({ where: { id } });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "comms.deleted", entity: "CommsMessage", entityId: id });
    revalidatePath("/comms");
    return { message: "Removed" };
  });
}
