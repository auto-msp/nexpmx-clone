"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { runAction, fStr } from "@/lib/action";

/** Mark every unread notification of the signed-in user (in this org) as read. */
export async function markAllNotificationsRead(_fd?: FormData) {
  void _fd;
  return runAction(null, async (ctx) => {
    const res = await prisma.notification.updateMany({
      where: { orgId: ctx.orgId, userId: ctx.userId, readAt: null },
      data: { readAt: new Date() },
    });
    revalidatePath("/notifications");
    revalidatePath("/dashboard");
    return { message: res.count ? `${res.count} marked as read` : "Nothing to mark" };
  });
}

export async function markNotificationRead(fd: FormData) {
  return runAction(null, async (ctx) => {
    const id = fStr(fd, "id");
    await prisma.notification.updateMany({
      where: { id, orgId: ctx.orgId, userId: ctx.userId, readAt: null },
      data: { readAt: new Date() },
    });
    revalidatePath("/notifications");
    return { id };
  });
}
