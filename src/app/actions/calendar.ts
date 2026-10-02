"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { runAction, fStr, fOpt, fBool, fIk, type ActionContext } from "@/lib/action";
import { audit } from "@/lib/audit";
import { withIdempotency } from "@/lib/idempotency";
import { isKey, istDateTime } from "@/components/home/dates";

const KINDS = ["MEETING", "FOLLOW_UP", "LEAVE"];

const baseSchema = z.object({
  title: z.string().trim().min(1, "Give the event a title").max(160, "Title is too long (160 characters max)"),
  location: z.string().trim().max(200, "Location is too long").optional(),
  notes: z.string().trim().max(4000, "Notes are too long").optional(),
});

async function readEvent(ctx: ActionContext, fd: FormData) {
  const parsed = baseSchema.parse({
    title: fStr(fd, "title"),
    location: fOpt(fd, "location") ?? undefined,
    notes: fOpt(fd, "notes") ?? undefined,
  });
  const kind = fStr(fd, "kind") || "MEETING";
  if (!KINDS.includes(kind)) throw new Error("Pick a valid event type.");

  const date = fStr(fd, "date");
  if (!isKey(date)) throw new Error("Pick a date for the event.");
  const endDateRaw = fStr(fd, "endDate");
  if (endDateRaw && !isKey(endDateRaw)) throw new Error("The end date is not valid.");
  const allDay = fBool(fd, "allDay");

  const startTime = fStr(fd, "startTime");
  const endTime = fStr(fd, "endTime");
  for (const t of [startTime, endTime]) {
    if (t && !/^\d{2}:\d{2}$/.test(t)) throw new Error("Times must look like 14:30.");
  }

  const startsAt = istDateTime(date, allDay ? "00:00" : startTime || "09:00");
  let endsAt: Date | null = null;
  if (allDay) {
    if (endDateRaw && endDateRaw > date) endsAt = istDateTime(endDateRaw, "23:59");
  } else if (endTime) {
    endsAt = istDateTime(endDateRaw || date, endTime);
  } else if (endDateRaw && endDateRaw > date) {
    endsAt = istDateTime(endDateRaw, "23:59");
  }
  if (endsAt && endsAt.getTime() <= startsAt.getTime()) throw new Error("The event must end after it starts.");

  const clientId = fOpt(fd, "clientId");
  if (clientId) {
    const c = await prisma.client.findFirst({ where: { id: clientId, orgId: ctx.orgId }, select: { id: true } });
    if (!c) throw new Error("That client no longer exists.");
  }

  return {
    title: parsed.title,
    location: parsed.location ?? null,
    notes: parsed.notes ?? null,
    kind,
    allDay,
    startsAt,
    endsAt,
    clientId,
  };
}

export async function createEvent(fd: FormData) {
  return runAction("task:write", async (ctx) => {
    const data = await readEvent(ctx, fd);
    const out = await withIdempotency(ctx.orgId, "calendar.create", fIk(fd), (tx) =>
      tx.calendarEvent.create({
        data: { ...data, orgId: ctx.orgId, creatorId: ctx.userId },
        select: { id: true },
      }),
    );
    if (out.kind === "created") {
      await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "event.created", entity: "CalendarEvent", entityId: out.entityId });
    }
    revalidatePath("/calendar");
    return { id: out.entityId, message: "Event added" };
  });
}

function canManage(ctx: ActionContext, creatorId: string): boolean {
  return creatorId === ctx.userId || ["OWNER", "ADMIN", "MANAGER"].includes(ctx.role);
}

export async function updateEvent(fd: FormData) {
  return runAction("task:write", async (ctx) => {
    const id = fStr(fd, "id");
    const existing = await prisma.calendarEvent.findFirst({ where: { id, orgId: ctx.orgId }, select: { id: true, creatorId: true } });
    if (!existing) throw new Error("Event not found.");
    if (!canManage(ctx, existing.creatorId)) throw new Error("Only the creator or a manager can change this event.");
    const data = await readEvent(ctx, fd);
    await prisma.calendarEvent.update({ where: { id: existing.id }, data });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "event.updated", entity: "CalendarEvent", entityId: existing.id });
    revalidatePath("/calendar");
    return { id, message: "Event saved" };
  });
}

export async function deleteEvent(fd: FormData) {
  return runAction("task:write", async (ctx) => {
    const id = fStr(fd, "id");
    const existing = await prisma.calendarEvent.findFirst({ where: { id, orgId: ctx.orgId }, select: { id: true, creatorId: true } });
    if (!existing) throw new Error("Event not found.");
    if (!canManage(ctx, existing.creatorId)) throw new Error("Only the creator or a manager can delete this event.");
    await prisma.calendarEvent.delete({ where: { id: existing.id } });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "event.deleted", entity: "CalendarEvent", entityId: existing.id });
    revalidatePath("/calendar");
    return { message: "Event deleted" };
  });
}
