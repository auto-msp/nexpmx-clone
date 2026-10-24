"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireEntitlement } from "@/lib/entitlements";
import { runAction, fStr, fOpt, fBool, fIk, type ActionResult } from "@/lib/action";
import { withIdempotency } from "@/lib/idempotency";
import {
  matchAutomations,
  recipeOf,
  TRIGGER_OPTIONS,
  type AutomationEvent,
  type AutomationTrigger,
} from "@/lib/automations";
import { getMailProvider, automationEmail, appUrl, isPlausibleEmail } from "@/lib/mail";

/**
 * Automations runner.
 *
 * Structural facts mirrored from screenshot evidence: a ready-to-use recipe
 * library ("+ Add" installs one), a custom builder (trigger select, action
 * checkboxes, task title, watch scope Everything/One client/One project),
 * and a "Your automations" tab with enable/disable and remove.
 *
 * UI actions (install / create / toggle / delete) RETURN a result so the
 * message survives production error masking. Dispatch: domain events call
 * emitAutomationEvent(); we load enabled automations, match with the PURE
 * matcher, then execute effects inline. Effects are honest about scope:
 * notifications land in Notification rows and are surfaced in the Home
 * attention queue and the bell; create_task inserts a real Task under a
 * project when the event carries one (or the watch scope's project), else
 * under the org's most recent active project.
 */

const TRIGGERS = TRIGGER_OPTIONS.map((t) => t.value) as string[];

const createAutomationSchema = z.object({
  name: z.string().trim().min(1, "Give the automation a name").max(120),
  trigger: z.string().refine((v) => TRIGGERS.includes(v), "Choose a trigger"),
  notifyFounders: z.boolean(),
  notifyClient: z.boolean(),
  createTask: z.boolean(),
  taskTitle: z.string().trim().max(200).optional(),
  watchScope: z.enum(["ALL", "CLIENT", "PROJECT"]),
});

function revalidateAutomations() {
  revalidatePath("/ai/automations");
  revalidatePath("/ai");
}

export async function installRecipe(fd: FormData): Promise<ActionResult> {
  return runAction("automation:write", async (ctx) => {
    await requireEntitlement(ctx.orgId);
    const recipe = recipeOf(fStr(fd, "recipeId"));
    if (!recipe) throw new Error("That recipe is no longer available.");

    const dupe = await prisma.automation.findFirst({
      where: { orgId: ctx.orgId, name: recipe.title },
      select: { id: true },
    });
    if (dupe) throw new Error("You already added that one. Find it under Your automations.");

    const row = await prisma.automation.create({
      data: {
        orgId: ctx.orgId,
        name: recipe.title,
        enabled: true,
        trigger: recipe.trigger,
        notifyFounders: recipe.effects.includes("notify_founders"),
        notifyClient: recipe.effects.includes("notify_client"),
        createTask: recipe.effects.includes("create_task"),
        taskTitle: recipe.taskTitle ?? null,
        watchScope: "ALL",
        configJson: JSON.stringify({ recipeId: recipe.id }),
      },
    });
    await audit({
      orgId: ctx.orgId,
      actorId: ctx.userId,
      action: "automation.installed",
      entity: "Automation",
      entityId: row.id,
      meta: { name: recipe.title, recipe: recipe.id },
    });
    revalidateAutomations();
    return { id: row.id, message: `Added "${recipe.title}".` };
  });
}

export async function createAutomation(fd: FormData): Promise<ActionResult> {
  return runAction("automation:write", async (ctx) => {
    await requireEntitlement(ctx.orgId);
    const ik = fIk(fd);
    const p = createAutomationSchema.parse({
      name: fStr(fd, "name"),
      trigger: fStr(fd, "trigger"),
      notifyFounders: fBool(fd, "notifyFounders"),
      notifyClient: fBool(fd, "notifyClient"),
      createTask: fBool(fd, "createTask"),
      taskTitle: fOpt(fd, "taskTitle") ?? undefined,
      watchScope: fStr(fd, "watchScope") || "ALL",
    });
    if (!p.notifyFounders && !p.notifyClient && !p.createTask) {
      throw new Error("Pick at least one action: what should happen when it fires?");
    }

    let watchClientId: string | null = null;
    let watchProjectId: string | null = null;
    if (p.watchScope === "CLIENT") {
      const id = fStr(fd, "watchClientId");
      if (!id) throw new Error("Choose which client to watch.");
      const c = await prisma.client.findFirst({ where: { id, orgId: ctx.orgId }, select: { id: true } });
      if (!c) throw new Error("Client not found.");
      watchClientId = c.id;
    }
    if (p.watchScope === "PROJECT") {
      const id = fStr(fd, "watchProjectId");
      if (!id) throw new Error("Choose which project to watch.");
      const pr = await prisma.project.findFirst({ where: { id, orgId: ctx.orgId }, select: { id: true } });
      if (!pr) throw new Error("Project not found.");
      watchProjectId = pr.id;
    }

    const out = await withIdempotency(ctx.orgId, "automation.create", ik, (tx) =>
      tx.automation.create({
        data: {
          orgId: ctx.orgId,
          name: p.name,
          enabled: true,
          trigger: p.trigger,
          notifyFounders: p.notifyFounders,
          notifyClient: p.notifyClient,
          createTask: p.createTask,
          taskTitle: p.taskTitle ?? null,
          watchScope: p.watchScope,
          watchClientId,
          watchProjectId,
        },
      }),
    );
    if (out.kind === "created") {
      await audit({
        orgId: ctx.orgId,
        actorId: ctx.userId,
        action: "automation.created",
        entity: "Automation",
        entityId: out.entityId,
        meta: { trigger: p.trigger, scope: p.watchScope },
      });
    }
    revalidateAutomations();
    return { id: out.entityId, message: "Automation created.", redirect: "/ai/automations?tab=yours" };
  });
}

export async function toggleAutomation(fd: FormData): Promise<ActionResult> {
  return runAction("automation:write", async (ctx) => {
    await requireEntitlement(ctx.orgId);
    const id = fStr(fd, "id");
    const existing = await prisma.automation.findFirst({ where: { id, orgId: ctx.orgId } });
    if (!existing) throw new Error("Automation not found.");
    await prisma.automation.update({ where: { id }, data: { enabled: !existing.enabled } });
    await audit({
      orgId: ctx.orgId,
      actorId: ctx.userId,
      action: existing.enabled ? "automation.disabled" : "automation.enabled",
      entity: "Automation",
      entityId: id,
    });
    revalidateAutomations();
    return { message: existing.enabled ? "Paused." : "Switched on." };
  });
}

export async function deleteAutomation(fd: FormData): Promise<ActionResult> {
  return runAction("automation:write", async (ctx) => {
    const id = fStr(fd, "id");
    const existing = await prisma.automation.findFirst({ where: { id, orgId: ctx.orgId } });
    if (!existing) throw new Error("Automation not found.");
    await prisma.automation.delete({ where: { id } });
    await audit({
      orgId: ctx.orgId,
      actorId: ctx.userId,
      action: "automation.deleted",
      entity: "Automation",
      entityId: id,
      meta: { name: existing.name },
    });
    revalidateAutomations();
    return { message: "Automation deleted." };
  });
}

// ── Event dispatch ───────────────────────────────────────────────────────────

/**
 * Fire automations for a domain event. Called from other server actions
 * (invoice paid, proposal accepted, project created, task completed).
 * Safe-by-default: failures are logged and never break the originating
 * business action.
 */
export async function emitAutomationEvent(event: {
  trigger: AutomationTrigger;
  subjectTitle: string;
  clientId?: string | null;
  projectId?: string | null;
}) {
  try {
    // Resolve org from the subject entities (the caller is a server action
    // that already verified tenancy; we still scope every write below).
    let orgId: string | null = null;
    if (event.projectId) {
      const p = await prisma.project.findUnique({
        where: { id: event.projectId },
        select: { orgId: true },
      });
      orgId = p?.orgId ?? null;
    }
    if (!orgId && event.clientId) {
      const c = await prisma.client.findUnique({
        where: { id: event.clientId },
        select: { orgId: true },
      });
      orgId = c?.orgId ?? null;
    }
    if (!orgId) return;

    const rows = await prisma.automation.findMany({
      where: { orgId, enabled: true },
    });

    const plans = matchAutomations(
      rows.map((r) => ({
        id: r.id,
        enabled: r.enabled,
        trigger: r.trigger,
        notifyFounders: r.notifyFounders,
        notifyClient: r.notifyClient,
        createTask: r.createTask,
        taskTitle: r.taskTitle,
        watchScope: r.watchScope,
        watchClientId: r.watchClientId,
        watchProjectId: r.watchProjectId,
      })),
      {
        trigger: event.trigger,
        orgId,
        clientId: event.clientId ?? null,
        projectId: event.projectId ?? null,
        subjectTitle: event.subjectTitle,
      } satisfies AutomationEvent,
    );

    const founderMembers = await prisma.membership.findMany({
      where: { orgId, role: { in: ["OWNER", "ADMIN"] } },
      select: { userId: true, user: { select: { email: true, name: true } } },
    });
    const founderIds = founderMembers.map((m) => m.userId);

    // Org-wide email preference gate (Settings → Notifications).
    const orgPrefs = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true, notifyPayments: true, notifyProposals: true, notifyMilestones: true },
    });
    const prefsEnabled = (() => {
      switch (event.trigger) {
        case "invoice.paid": return orgPrefs?.notifyPayments ?? true;
        case "proposal.signed": return orgPrefs?.notifyProposals ?? true;
        case "milestone.completed": return orgPrefs?.notifyMilestones ?? true;
        default: return true; // project.created / task.completed: no dedicated toggle
      }
    })();
    const mail = getMailProvider();

    // Client contacts: portal-linked client user, if any exists via email match.
    let clientNotifyUserId: string | null = null;
    if (event.clientId) {
      const client = await prisma.client.findUnique({
        where: { id: event.clientId },
        select: { email: true },
      });
      if (client?.email) {
        const u = await prisma.user.findUnique({ where: { email: client.email }, select: { id: true } });
        clientNotifyUserId = u?.id ?? null;
      }
    }

    for (const plan of plans) {
      for (const effect of plan.effects) {
        if (effect === "notify_founders") {
          await prisma.notification.createMany({
            data: founderIds.map((userId) => ({
              userId,
              orgId,
              type: "automation.founders",
              payloadJson: JSON.stringify({
                title: plan.event.subjectTitle,
                trigger: plan.event.trigger,
              }),
            })),
          });
          // Email the founders (best-effort, pref-gated, rate-limited by
          // provider). Failures logged, never thrown.
          if (prefsEnabled && orgPrefs) {
            const tpl = automationEmail({
              orgName: orgPrefs.name,
              title: plan.event.subjectTitle,
              detail: automationDetail(event.trigger, plan.event.subjectTitle),
              appUrl: appUrl(),
            });
            for (const m of founderMembers) {
              const to = m.user.email;
              if (!to || !isPlausibleEmail(to)) continue;
              await mail.send({ to, subject: tpl.subject, html: tpl.html, text: tpl.text, template: "automation" });
            }
          }
        } else if (effect === "notify_client") {
          if (clientNotifyUserId) {
            await prisma.notification.create({
              data: {
                userId: clientNotifyUserId,
                orgId,
                type: "automation.client",
                payloadJson: JSON.stringify({
                  title: plan.event.subjectTitle,
                  trigger: plan.event.trigger,
                }),
              },
            });
          } else {
            // No portal user to notify in-app: log a comms record so the
            // touchpoint is not lost, and email the client's billing address
            // when the org has a mail provider configured.
            await prisma.commsMessage.create({
              data: {
                orgId,
                clientId: event.clientId ?? null,
                direction: "OUT",
                channel: "NOTE",
                subject: `Automation: ${plan.event.subjectTitle}`,
                body: "Client notification recorded (no portal account to notify in-app).",
                authorId: null,
              },
            });
            if (prefsEnabled && event.clientId) {
              const client = await prisma.client.findUnique({
                where: { id: event.clientId },
                select: { name: true, email: true },
              });
              if (client?.email && isPlausibleEmail(client.email)) {
                const tpl = automationEmail({
                  orgName: orgPrefs?.name ?? "",
                  title: plan.event.subjectTitle,
                  detail: automationDetail(event.trigger, plan.event.subjectTitle),
                  appUrl: appUrl(),
                });
                await mail.send({
                  to: client.email,
                  subject: tpl.subject,
                  html: tpl.html,
                  text: tpl.text,
                  template: "automation",
                });
              }
            }
          }
        } else if (effect === "create_task") {
          let projectId = event.projectId ?? null;
          if (!projectId) {
            const fallback = await prisma.project.findFirst({
              where: { orgId, status: "ACTIVE" },
              orderBy: { createdAt: "desc" },
              select: { id: true },
            });
            projectId = fallback?.id ?? null;
          }
          if (projectId) {
            await prisma.task.create({
              data: {
                orgId,
                projectId,
                title: plan.taskTitle ?? `Automation: ${plan.event.subjectTitle}`,
              },
            });
          }
        }
      }
      await prisma.automation.update({
        where: { id: plan.automationId },
        data: { lastFiredAt: new Date() },
      });
    }
  } catch (err) {
    console.error("[automations] dispatch failed", err);
  }
}

/** Human sentence for the notification/email, per trigger. Original copy. */
function automationDetail(trigger: AutomationTrigger, subject: string): string {
  switch (trigger) {
    case "invoice.paid":
      return `Payment received for invoice ${subject}.`;
    case "proposal.signed":
      return `Proposal "${subject}" was accepted — onboarding can begin.`;
    case "project.created":
      return `New project "${subject}" was opened.`;
    case "milestone.completed":
      return `Milestone "${subject}" is complete.`;
    case "task.completed":
      return `Task "${subject}" was completed.`;
  }
}
