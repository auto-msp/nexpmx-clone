"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { withIdempotency } from "@/lib/idempotency";
import { requireEntitlement } from "@/lib/entitlements";
import { runAction, fStr, fIk, type ActionResult } from "@/lib/action";
import { areaOf, bankFactKey, bankQuestionOf, parseImportText, slugKey } from "@/lib/memory";

/**
 * Business Memory actions. The memory is the substrate the AI assistant and
 * CIO brief read from; writes are org-scoped, audited and idempotent where
 * duplicated submissions are likely (import). Stored `category` is one of the
 * eight area ids (legacy values are still read via areaOf()).
 */

function revalidateMemory() {
  revalidatePath("/memory");
  revalidatePath("/memory/what-we-know");
  revalidatePath("/memory/questions");
  revalidatePath("/cio");
}

const factSchema = z.object({
  category: z.string().trim().max(30),
  title: z.string().trim().min(1, "Say what this is about").max(80),
  value: z.string().trim().min(1, "Write what you know").max(1000),
});

export async function addMemoryFact(fd: FormData): Promise<ActionResult> {
  return runAction("memory:write", async (ctx) => {
    await requireEntitlement(ctx.orgId);
    const p = factSchema.parse({
      category: fStr(fd, "category") || "ways",
      title: fStr(fd, "factKey") || fStr(fd, "title"),
      value: fStr(fd, "value"),
    });
    const factKey = slugKey(p.title);
    if (!factKey) throw new Error("The title needs letters or numbers.");
    const category = areaOf(p.category);

    const existing = await prisma.memoryFact.findUnique({ where: { orgId_factKey: { orgId: ctx.orgId, factKey } }, select: { id: true } });
    await prisma.memoryFact.upsert({
      where: { orgId_factKey: { orgId: ctx.orgId, factKey } },
      create: { orgId: ctx.orgId, category, factKey, value: p.value, authorId: ctx.userId },
      update: { value: p.value, category, status: "ACTIVE" },
    });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "memory.fact_upserted", entity: "MemoryFact", entityId: factKey, meta: { category } });
    revalidateMemory();
    return { message: existing ? "Updated the existing note with that title." : "Saved to your memory." };
  });
}

export async function updateMemoryFact(fd: FormData): Promise<ActionResult> {
  return runAction("memory:write", async (ctx) => {
    await requireEntitlement(ctx.orgId);
    const id = fStr(fd, "id");
    const fact = await prisma.memoryFact.findFirst({ where: { id, orgId: ctx.orgId } });
    if (!fact) throw new Error("That note no longer exists.");
    const p = factSchema.parse({
      category: fStr(fd, "category") || fact.category,
      title: fStr(fd, "title") || fact.factKey,
      value: fStr(fd, "value"),
    });
    const bank = fact.factKey.startsWith("q-") ? bankQuestionOf(fact.factKey.slice(2)) : null;
    if (bank) {
      // Guided-question answers keep their key so the question stays answered.
      await prisma.memoryFact.update({
        where: { id },
        data: { value: `${bank.text} — ${p.value}`.slice(0, 1000), category: areaOf(p.category) },
      });
      revalidateMemory();
      return { message: "Saved." };
    }
    const factKey = slugKey(p.title) || fact.factKey;
    if (factKey !== fact.factKey) {
      const clash = await prisma.memoryFact.findUnique({ where: { orgId_factKey: { orgId: ctx.orgId, factKey } }, select: { id: true } });
      if (clash) throw new Error("Another note already uses that title.");
    }
    await prisma.memoryFact.update({
      where: { id },
      data: { factKey, value: p.value, category: areaOf(p.category) },
    });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "memory.fact_updated", entity: "MemoryFact", entityId: id });
    revalidateMemory();
    return { message: "Saved." };
  });
}

export async function setMemoryFactStatus(fd: FormData): Promise<ActionResult> {
  return runAction("memory:write", async (ctx) => {
    await requireEntitlement(ctx.orgId);
    const id = fStr(fd, "id");
    const status = fStr(fd, "status");
    if (status !== "ACTIVE" && status !== "ARCHIVED") throw new Error("Unknown status.");
    const fact = await prisma.memoryFact.findFirst({ where: { id, orgId: ctx.orgId }, select: { id: true } });
    if (!fact) throw new Error("That note no longer exists.");
    await prisma.memoryFact.update({ where: { id }, data: { status } });
    await audit({
      orgId: ctx.orgId,
      actorId: ctx.userId,
      action: status === "ARCHIVED" ? "memory.fact_archived" : "memory.fact_restored",
      entity: "MemoryFact",
      entityId: id,
    });
    revalidateMemory();
    return { message: status === "ARCHIVED" ? "Archived." : "Restored." };
  });
}

// ── Import ──────────────────────────────────────────────────────────────────

const importSchema = z
  .array(
    z.object({
      category: z.string().trim().max(30),
      factKey: z.string().trim().min(1).max(80),
      value: z.string().trim().min(1).max(1000),
    }),
  )
  .min(1, "Select at least one item to import.")
  .max(300, "Import up to 300 items at a time.");

/** Confirm step of the import flow: the page sends the reviewed list as JSON. */
export async function importFacts(fd: FormData): Promise<ActionResult> {
  return runAction("memory:write", async (ctx) => {
    await requireEntitlement(ctx.orgId);
    const ik = fIk(fd);
    let raw: unknown;
    try {
      raw = JSON.parse(fStr(fd, "payload"));
    } catch {
      throw new Error("Could not read the import. Reload the page and try again.");
    }
    const items = importSchema.parse(raw).map((f) => ({
      category: areaOf(f.category),
      factKey: slugKey(f.factKey) || "note",
      value: f.value,
    }));

    const out = await withIdempotency(ctx.orgId, "memory.import", ik, async (tx) => {
      for (const f of items) {
        await tx.memoryFact.upsert({
          where: { orgId_factKey: { orgId: ctx.orgId, factKey: f.factKey } },
          create: { orgId: ctx.orgId, category: f.category, factKey: f.factKey, value: f.value, authorId: ctx.userId },
          update: { value: f.value, category: f.category, status: "ACTIVE" },
        });
      }
      return { id: `import-${items.length}` };
    });
    if (out.kind === "created") {
      await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "memory.imported", entity: "MemoryFact", entityId: out.entityId, meta: { count: items.length } });
    }
    revalidateMemory();
    return { message: `${items.length} item${items.length === 1 ? "" : "s"} added to your memory.`, redirect: "/memory/what-we-know" };
  });
}

/** Text-only import (kept for older callers): parses and imports in one step. */
export async function importMemory(fd: FormData): Promise<ActionResult> {
  const { facts } = parseImportText(fStr(fd, "importText").slice(0, 100_000), "ways");
  const next = new FormData();
  next.set("ik", fStr(fd, "ik"));
  next.set("payload", JSON.stringify(facts));
  return importFacts(next);
}

// ── Questions ───────────────────────────────────────────────────────────────

export async function askMemoryQuestion(fd: FormData): Promise<ActionResult> {
  return runAction("memory:write", async (ctx) => {
    await requireEntitlement(ctx.orgId);
    const question = z.string().trim().min(5, "Write the question out in a sentence").max(300).parse(fStr(fd, "question"));
    const q = await prisma.memoryQuestion.create({ data: { orgId: ctx.orgId, question, askerId: ctx.userId } });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "memory.question_asked", entity: "MemoryQuestion", entityId: q.id });
    revalidateMemory();
    return { id: q.id, message: "Question added for the team." };
  });
}

/** Answer a team question; the answer is also saved as a note in the chosen area. */
export async function answerMemoryQuestion(fd: FormData): Promise<ActionResult> {
  return runAction("memory:write", async (ctx) => {
    await requireEntitlement(ctx.orgId);
    const id = fStr(fd, "id");
    const answer = z.string().trim().min(1, "Write an answer first").max(2000).parse(fStr(fd, "answer"));
    const area = areaOf(fStr(fd, "category") || "ways");
    const q = await prisma.memoryQuestion.findFirst({ where: { id, orgId: ctx.orgId } });
    if (!q) throw new Error("That question no longer exists.");

    await prisma.memoryQuestion.update({ where: { id }, data: { answer, state: "ANSWERED" } });
    const factKey = `${slugKey(q.question).slice(0, 68)}-${id.slice(-6).toLowerCase()}`;
    await prisma.memoryFact.upsert({
      where: { orgId_factKey: { orgId: ctx.orgId, factKey } },
      create: { orgId: ctx.orgId, category: area, factKey, value: answer.slice(0, 1000), authorId: ctx.userId },
      update: { value: answer.slice(0, 1000), category: area, status: "ACTIVE" },
    });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "memory.question_answered", entity: "MemoryQuestion", entityId: id });
    revalidateMemory();
    return { message: "Answer saved." };
  });
}

export async function deleteMemoryQuestion(fd: FormData): Promise<ActionResult> {
  return runAction("memory:write", async (ctx) => {
    const id = fStr(fd, "id");
    const q = await prisma.memoryQuestion.findFirst({ where: { id, orgId: ctx.orgId }, select: { id: true } });
    if (!q) throw new Error("That question no longer exists.");
    await prisma.memoryQuestion.delete({ where: { id } });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "memory.question_deleted", entity: "MemoryQuestion", entityId: id });
    revalidateMemory();
    return { message: "Question removed." };
  });
}

/** Answer one of the built-in guided questions. Stored as a fact under q-<id>. */
export async function answerBankQuestion(fd: FormData): Promise<ActionResult> {
  return runAction("memory:write", async (ctx) => {
    await requireEntitlement(ctx.orgId);
    const bank = bankQuestionOf(fStr(fd, "bankId"));
    if (!bank) throw new Error("That question is no longer in the list.");
    const answer = z.string().trim().min(2, "Write a few words first").max(1000).parse(fStr(fd, "answer"));
    const factKey = bankFactKey(bank.id);
    await prisma.memoryFact.upsert({
      where: { orgId_factKey: { orgId: ctx.orgId, factKey } },
      create: { orgId: ctx.orgId, category: bank.area, factKey, value: `${bank.text} — ${answer}`.slice(0, 1000), authorId: ctx.userId },
      update: { value: `${bank.text} — ${answer}`.slice(0, 1000), category: bank.area, status: "ACTIVE" },
    });
    await audit({ orgId: ctx.orgId, actorId: ctx.userId, action: "memory.question_answered", entity: "MemoryFact", entityId: factKey, meta: { area: bank.area } });
    revalidateMemory();
    return { message: "Saved." };
  });
}
