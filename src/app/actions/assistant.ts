"use server";

import { prisma } from "@/lib/db";
import { requireApiContext, HttpError } from "@/lib/api";
import { planOf } from "@/lib/plans";
import { inr } from "@/lib/format";
import { getAiProvider, type AiContextChunk } from "@/lib/ai";
import { audit } from "@/lib/audit";

/**
 * Grounded-answer pipeline:
 *   question → org-scoped context assembly → provider → credits → response
 *
 * The context assembly is intentionally provider-agnostic: any LLM vendor
 * can be plugged in behind AiProvider without touching this code.
 */

const STOP = new Set([
  "the", "and", "for", "are", "was", "what", "which", "who", "how", "much", "many", "about", "with",
  "that", "this", "from", "have", "has", "had", "our", "your", "you", "any", "all", "can", "should",
  "does", "did", "when", "where", "why", "tell", "show", "give", "list", "know", "need", "get", "out",
  "not", "but", "its", "their", "them", "they", "been", "into", "than", "then", "there", "now",
]);

function termsOf(question: string): string[] {
  const seen = new Set<string>();
  for (const t of question.toLowerCase().split(/[^a-z0-9]+/)) {
    if (t.length > 2 && !STOP.has(t)) seen.add(t);
  }
  return [...seen].slice(0, 6);
}

const grossOf = (i: { amountMinor: number; gstRateBps: number }) =>
  i.amountMinor + Math.round((i.amountMinor * i.gstRateBps) / 10_000);

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
  const terms = termsOf(question);
  const any = (fields: string[]): object =>
    terms.length
      ? { OR: terms.flatMap((t) => fields.map((f) => ({ [f]: { contains: t, mode: "insensitive" as const } }))) }
      : { id: "__none__" };

  const [clients, projects, invoices, decisions, tasks, facts, docs] = await Promise.all([
    prisma.client.findMany({ where: { orgId: ctx.orgId, ...any(["name", "company", "notes"]) }, take: 5 }),
    prisma.project.findMany({
      where: { orgId: ctx.orgId, ...any(["name", "description"]) },
      take: 5,
      include: { client: { select: { name: true } } },
    }),
    prisma.invoice.findMany({
      where: { orgId: ctx.orgId, ...any(["number", "notes"]) },
      take: 5,
      include: { client: { select: { name: true } } },
    }),
    prisma.decision.findMany({
      where: { orgId: ctx.orgId, ...any(["title", "body"]) },
      take: 5,
    }),
    prisma.task.findMany({ where: { orgId: ctx.orgId, ...any(["title", "description"]) }, take: 5 }),
    prisma.memoryFact.findMany({
      where: { orgId: ctx.orgId, status: "ACTIVE", ...any(["factKey", "value"]) },
      take: 5,
    }),
    prisma.document.findMany({ where: { orgId: ctx.orgId, ...any(["title"]) }, take: 3 }),
  ]);

  const context: AiContextChunk[] = [
    ...clients.map<AiContextChunk>((c) => ({
      kind: "client",
      title: c.name,
      snippet: c.notes?.slice(0, 160) || c.company || c.email || "Active client",
    })),
    ...projects.map<AiContextChunk>((p) => ({
      kind: "project",
      title: p.name,
      snippet: p.client ? `Client: ${p.client.name} · ${p.status.toLowerCase()}` : p.status.toLowerCase(),
    })),
    ...invoices.map<AiContextChunk>((i) => ({
      kind: "invoice",
      title: `${i.number} · ${i.client.name}`,
      snippet: `${inr(grossOf(i))} · ${i.status.toLowerCase()}`,
    })),
    ...decisions.map<AiContextChunk>((d) => ({
      kind: "decision",
      title: d.title,
      snippet: d.body.slice(0, 160),
    })),
    ...tasks.map<AiContextChunk>((t) => ({
      kind: "task",
      title: t.title,
      snippet: `${t.status.replace(/_/g, " ").toLowerCase()}${t.dueDate ? ` · due ${t.dueDate.toISOString().slice(0, 10)}` : ""}`,
    })),
    ...facts.map<AiContextChunk>((f) => ({
      kind: "document",
      title: `Memory: ${f.factKey}`,
      snippet: f.value.slice(0, 160),
    })),
    ...docs.map<AiContextChunk>((d) => ({
      kind: "document",
      title: d.title,
      snippet: d.mimeType,
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

/* ── Chat entry point used by /assistant and the CIO "ask" box ───────────── */

export type AssistantReply =
  | { ok: true; answer: string; sources: AiContextChunk[]; creditsUsed: number }
  | { ok: false; error: string };

type Snapshot = { text: string; sources: AiContextChunk[] };

async function snapshotFor(orgId: string, q: string): Promise<Snapshot | null> {
  const s = q.toLowerCase();
  const now = new Date();
  const weekOut = new Date(now.getTime() + 7 * 86_400_000);
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000);

  if (/overdue|owe|outstanding|receivable|unpaid|invoice|cash|collect|money|number|revenue/.test(s)) {
    const [open, paid] = await Promise.all([
      prisma.invoice.findMany({
        where: { orgId, status: { in: ["SENT", "OVERDUE"] } },
        include: { client: { select: { name: true } } },
        orderBy: { dueAt: "asc" },
        take: 50,
      }),
      prisma.invoice.findMany({ where: { orgId, status: "PAID", updatedAt: { gte: monthAgo } }, select: { amountMinor: true, gstRateBps: true } }),
    ]);
    const overdue = open.filter((i) => i.status === "OVERDUE" || (i.dueAt && i.dueAt < now));
    const total = open.reduce((n, i) => n + grossOf(i), 0);
    const overdueTotal = overdue.reduce((n, i) => n + grossOf(i), 0);
    const collected = paid.reduce((n, i) => n + grossOf(i), 0);
    const lines = [
      `Outstanding: ${inr(total)} across ${open.length} invoice${open.length === 1 ? "" : "s"}.`,
      `Overdue: ${inr(overdueTotal)} across ${overdue.length} invoice${overdue.length === 1 ? "" : "s"}.`,
      `Collected in the last 30 days: ${inr(collected)}.`,
    ];
    if (overdue.length) {
      lines.push("", "Oldest overdue:");
      for (const i of overdue.slice(0, 5)) lines.push(`• ${i.number} · ${i.client.name} — ${inr(grossOf(i))}${i.dueAt ? ` (due ${i.dueAt.toISOString().slice(0, 10)})` : ""}`);
    }
    return {
      text: lines.join("\n"),
      sources: overdue.slice(0, 5).map<AiContextChunk>((i) => ({ kind: "invoice", title: `${i.number} · ${i.client.name}`, snippet: `${inr(grossOf(i))} · ${i.status.toLowerCase()}` })),
    };
  }

  if (/week|plan|today|schedule|priorit|todo|to-do|due|task/.test(s)) {
    const [tasks, milestones] = await Promise.all([
      prisma.task.findMany({
        where: { orgId, status: { not: "DONE" }, dueDate: { not: null, lte: weekOut } },
        orderBy: { dueDate: "asc" },
        take: 12,
      }),
      prisma.milestone.findMany({
        where: { orgId, completedAt: null, dueDate: { not: null, lte: weekOut } },
        orderBy: { dueDate: "asc" },
        take: 6,
        include: { project: { select: { name: true } } },
      }),
    ]);
    const late = tasks.filter((t) => t.dueDate && t.dueDate < now);
    const lines = [
      `${tasks.length} open task${tasks.length === 1 ? " is" : "s are"} due within seven days${late.length ? `, ${late.length} already late` : ""}.`,
    ];
    for (const t of tasks.slice(0, 8)) lines.push(`• ${t.title} — ${t.dueDate ? t.dueDate.toISOString().slice(0, 10) : "no date"}${t.dueDate && t.dueDate < now ? " (late)" : ""}`);
    if (milestones.length) {
      lines.push("", "Milestones coming up:");
      for (const m of milestones) lines.push(`• ${m.name} · ${m.project.name} — ${m.dueDate ? m.dueDate.toISOString().slice(0, 10) : ""}`);
    }
    if (!tasks.length && !milestones.length) lines.push("Nothing is scheduled this week. A good moment to plan the next phase or chase proposals.");
    return {
      text: lines.join("\n"),
      sources: tasks.slice(0, 5).map<AiContextChunk>((t) => ({ kind: "task", title: t.title, snippet: t.dueDate ? `due ${t.dueDate.toISOString().slice(0, 10)}` : t.status.toLowerCase() })),
    };
  }

  if (/risk|slip|behind|health|trouble|late|stuck/.test(s)) {
    const [projects, clients] = await Promise.all([
      prisma.project.findMany({
        where: {
          orgId,
          status: { not: "COMPLETED" },
          OR: [{ health: { in: ["AT_RISK", "OFF_TRACK"] } }, { deadline: { lt: now } }],
        },
        include: { client: { select: { name: true } } },
        take: 8,
      }),
      prisma.client.findMany({ where: { orgId, status: "ACTIVE", health: { in: ["WATCH", "AT_RISK"] } }, take: 8 }),
    ]);
    const lines = [`${projects.length} project${projects.length === 1 ? "" : "s"} flagged, ${clients.length} client${clients.length === 1 ? "" : "s"} to watch.`];
    for (const p of projects) lines.push(`• ${p.name}${p.client ? ` (${p.client.name})` : ""} — ${p.deadline && p.deadline < now ? "past its deadline" : p.health.replace(/_/g, " ").toLowerCase()}`);
    for (const c of clients) lines.push(`• ${c.name} — client health: ${c.health.replace(/_/g, " ").toLowerCase()}`);
    return {
      text: lines.join("\n"),
      sources: [
        ...projects.map<AiContextChunk>((p) => ({ kind: "project", title: p.name, snippet: p.health.toLowerCase() })),
        ...clients.map<AiContextChunk>((c) => ({ kind: "client", title: c.name, snippet: c.health.toLowerCase() })),
      ],
    };
  }
  return null;
}

async function overview(orgId: string): Promise<Snapshot> {
  const [clients, projects, openInvoices, facts] = await Promise.all([
    prisma.client.count({ where: { orgId, status: "ACTIVE" } }),
    prisma.project.count({ where: { orgId, status: "ACTIVE" } }),
    prisma.invoice.count({ where: { orgId, status: { in: ["SENT", "OVERDUE"] } } }),
    prisma.memoryFact.count({ where: { orgId, status: "ACTIVE" } }),
  ]);
  return {
    text: [
      "I could not match that to a specific client, project or note, so here is where things stand:",
      `• ${clients} active client${clients === 1 ? "" : "s"}`,
      `• ${projects} active project${projects === 1 ? "" : "s"}`,
      `• ${openInvoices} unpaid invoice${openInvoices === 1 ? "" : "s"}`,
      `• ${facts} thing${facts === 1 ? "" : "s"} saved in your business memory`,
      "",
      "Try naming a client or project, or ask about overdue invoices, this week's work or projects at risk.",
    ].join("\n"),
    sources: [],
  };
}

export async function askAssistant(question: string): Promise<AssistantReply> {
  try {
    const q = String(question ?? "").trim();
    if (q.length < 3) return { ok: false, error: "Ask a little more than that — a few words is enough." };
    if (q.length > 300) return { ok: false, error: "Keep the question under 300 characters." };
    const ctx = await requireApiContext();

    const engine = await buildContextAndAnswer(q);
    const snap = await snapshotFor(ctx.orgId, q);
    if (snap) {
      const extra = engine.sources.length
        ? `\n\nAlso relevant:\n${engine.sources.map((c) => `• [${c.kind}] ${c.title} — ${c.snippet}`).join("\n")}`
        : "";
      return { ok: true, answer: snap.text + extra, sources: [...snap.sources, ...engine.sources], creditsUsed: engine.creditsUsed };
    }
    if (engine.sources.length) return { ok: true, ...engine };
    const fallback = await overview(ctx.orgId);
    return { ok: true, answer: fallback.text, sources: [], creditsUsed: 0 };
  } catch (err) {
    if (err instanceof HttpError) return { ok: false, error: err.message };
    console.error("[assistant]", err);
    return { ok: false, error: "The assistant could not answer just now. Please try again." };
  }
}
