"use server";

import { prisma } from "@/lib/db";
import { requireApiContext, HttpError } from "@/lib/api";
import { planOf } from "@/lib/plans";
import { getAiProvider, AiContextChunk } from "@/lib/ai";
import { audit } from "@/lib/audit";

/**
 * Grounded-answer pipeline:
 *   question → org-scoped context assembly → provider → credits → response
 *
 * The context assembly is intentionally provider-agnostic: any LLM vendor
 * can be plugged in behind AiProvider without touching this code.
 */
export async function buildContextAndAnswer(question: string) {
  const ctx = await requireApiContext();
  const org = await prisma.organization.findUnique({
    where: { id: ctx.orgId },
    select: { aiCreditsUsed: true, plan: true },
  });
  const plan = planOf(org?.plan);

  // Entitlement: AI credits (RULE-ENT-02). Reject when exhausted.
  if ((org?.aiCreditsUsed ?? 0) >= plan.aiCreditsPerMonth) {
    throw new HttpError(402, "AI credit limit reached for this cycle. Upgrade your plan.");
  }

  // Pre-check only (fast fail); the authoritative gate is the atomic
  // conditional increment after the provider call (audit F3).
  const like = `%${question.toLowerCase()}%`;

  const [clients, projects, invoices, decisions] = await Promise.all([
    prisma.client.findMany({
      where: {
        orgId: ctx.orgId,
        OR: [
          { name: { contains: like } },
          { company: { contains: like } },
        ],
      },
      take: 5,
    }),
    prisma.project.findMany({
      where: { orgId: ctx.orgId, name: { contains: like } },
      take: 5,
      include: { client: { select: { name: true } } },
    }),
    prisma.invoice.findMany({
      where: {
        orgId: ctx.orgId,
        OR: [{ number: { contains: like } }],
      },
      take: 5,
      include: { client: { select: { name: true } } },
    }),
    prisma.decision.findMany({
      where: {
        orgId: ctx.orgId,
        OR: [{ title: { contains: like } }, { body: { contains: like } }],
      },
      take: 5,
      include: { author: { select: { name: true } } },
    }),
  ]);

  const context: AiContextChunk[] = [
    ...clients.map<AiContextChunk>((c) => ({
      kind: "client",
      title: c.name,
      snippet: c.company ?? c.email ?? "Active client",
    })),
    ...projects.map<AiContextChunk>((p) => ({
      kind: "project",
      title: p.name,
      snippet: p.client ? `Client: ${p.client.name}` : p.status,
    })),
    ...invoices.map<AiContextChunk>((i) => ({
      kind: "invoice",
      title: `${i.number} · ${i.client.name}`,
      snippet: `${(i.amountMinor / 100).toFixed(0)} INR · ${i.status}`,
    })),
    ...decisions.map<AiContextChunk>((d) => ({
      kind: "decision",
      title: d.title,
      snippet: d.body.slice(0, 160),
    })),
  ];

  const provider = getAiProvider();
  const result = await provider.answer(question, context);

  // Atomic metering (audit F3): increment only while under the cap. A
  // conditional updateMany is the check-and-set — concurrent queries can no
  // longer both slip past the read-then-write window. Zero rows updated
  // means another request consumed the final credits in the meantime.
  const updated = await prisma.organization.updateMany({
    where: {
      id: ctx.orgId,
      aiCreditsUsed: { lt: plan.aiCreditsPerMonth },
    },
    data: { aiCreditsUsed: { increment: result.creditsUsed } },
  });
  if (updated.count === 0 && result.creditsUsed > 0) {
    throw new HttpError(
      402,
      "AI credit limit reached for this cycle. Upgrade your plan.",
    );
  }
  if (result.creditsUsed > 0) {
    await prisma.usageEvent.create({
      data: { orgId: ctx.orgId, kind: "ai.search", credits: result.creditsUsed },
    });
  }

  await audit({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    action: "ai.query",
    entity: "Organization",
    entityId: ctx.orgId,
    // Only the question length is logged, never the content (PII redaction).
    meta: { questionLength: question.length, credits: result.creditsUsed },
  });

  return result;
}
