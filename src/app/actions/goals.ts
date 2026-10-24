"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { runAction, fStr, fOpt, fIk } from "@/lib/action";
import { audit } from "@/lib/audit";
import { withIdempotency } from "@/lib/idempotency";
import { GOAL_PERIODS, keyToDate, periodStartKey, todayKey, type GoalPeriod } from "@/components/home/dates";

const createSchema = z.object({
  title: z.string().trim().min(1, "Give the goal a title").max(160, "Title is too long (160 characters max)"),
  metric: z.string().trim().max(60, "Metric is too long").optional(),
});

function parseTarget(raw: string): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) throw new Error("Target must be a number above zero.");
  if (n > 1e12) throw new Error("That target is unrealistically large.");
  return n;
}

export async function createGoal(fd: FormData) {
  return runAction("task:write", async (ctx) => {
    const parsed = createSchema.parse({ title: fStr(fd, "title"), metric: fOpt(fd, "metric") ?? undefined });
    const period = fStr(fd, "period") || "WEEKLY";
    if (!(GOAL_PERIODS as string[]).includes(period)) throw new Error("Pick a valid period.");
    const target = parseTarget(fStr(fd, "target"));
    const periodStart = keyToDate(periodStartKey(period as GoalPeriod, todayKey()));

    const out = await withIdempotency(ctx.orgId, "goal.create", fIk(fd), (tx) =>
      tx.goal.create({
        data: {
          orgId: ctx.orgId,
          ownerId: ctx.userId,
          title: parsed.title,
          metric: parsed.metric ?? null,
          target,
          period,
          periodStart,
        },
        select: { id: true },
      }),
    );
    if (out.kind === "created") {
      await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "goal.created", entity: "Goal", entityId: out.entityId });
    }
    revalidatePath("/goals");
    return { id: out.entityId, message: "Goal added" };
  });
}

/** Change progress: mode "delta" adds `value` (may be negative); mode "set" replaces it. */
export async function updateGoalProgress(fd: FormData) {
  return runAction("task:write", async (ctx) => {
    const id = fStr(fd, "id");
    const mode = fStr(fd, "mode") === "set" ? "set" : "delta";
    const raw = fStr(fd, "value").replace(/,/g, "");
    const value = Number(raw);
    if (raw === "" || !Number.isFinite(value)) throw new Error("Enter a number.");
    const goal = await prisma.goal.findFirst({ where: { id, orgId: ctx.orgId } });
    if (!goal) throw new Error("Goal not found.");

    const next = Math.max(0, Math.round((mode === "set" ? value : goal.current + value) * 100) / 100);
    const done = goal.target && goal.target > 0 ? next >= goal.target : goal.done;
    await prisma.goal.update({ where: { id: goal.id }, data: { current: next, done } });
    revalidatePath("/goals");
    return { id, message: "Progress saved" };
  });
}

export async function toggleGoalDone(fd: FormData) {
  return runAction("task:write", async (ctx) => {
    const id = fStr(fd, "id");
    const goal = await prisma.goal.findFirst({ where: { id, orgId: ctx.orgId } });
    if (!goal) throw new Error("Goal not found.");
    const done = !goal.done;
    const current = done && goal.target ? Math.max(goal.current, goal.target) : goal.current;
    await prisma.goal.update({ where: { id: goal.id }, data: { done, current } });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: done ? "goal.completed" : "goal.reopened", entity: "Goal", entityId: goal.id });
    revalidatePath("/goals");
    return { id, message: done ? "Goal completed" : "Goal reopened" };
  });
}

export async function deleteGoal(fd: FormData) {
  return runAction("task:write", async (ctx) => {
    const id = fStr(fd, "id");
    const goal = await prisma.goal.findFirst({ where: { id, orgId: ctx.orgId }, select: { id: true } });
    if (!goal) throw new Error("Goal not found.");
    await prisma.goal.delete({ where: { id: goal.id } });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "goal.deleted", entity: "Goal", entityId: goal.id });
    revalidatePath("/goals");
    return { message: "Goal deleted" };
  });
}
