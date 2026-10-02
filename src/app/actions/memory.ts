"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireApiContext } from "@/lib/api";
import { requirePermission } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { withIdempotency } from "@/lib/idempotency";
import { requireEntitlement } from "@/lib/entitlements";
import { isMemoryCategory, parseMemoryImport } from "@/lib/memory";

/**
 * Business Memory actions. The memory is the substrate the AI assistant and
 * CIO brief read from; writes are org-scoped, audited and idempotent where
 * duplicated submissions are likely (import).
 */

const addFactSchema = z.object({
  category: z.string().transform((v) => (isMemoryCategory(v) ? v : "general")),
  factKey: z.string().trim().min(1, "Memory name is required").max(80),
  value: z.string().trim().min(1, "Value is required").max(500),
});

export async function addMemoryFact(formData: FormData) {
  const ctx = await requireApiContext();
  requirePermission(ctx.role, "memory:write");
  await requireEntitlement(ctx.orgId);

  const parsed = addFactSchema.safeParse({
    category: formData.get("category") || "general",
    factKey: formData.get("factKey"),
    value: formData.get("value"),
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }

  const factKey = parsed.data.factKey
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 80);
  if (!factKey) throw new Error("Memory name must contain letters or numbers");

  await prisma.memoryFact.upsert({
    where: { orgId_factKey: { orgId: ctx.orgId, factKey } },
    create: {
      orgId: ctx.orgId,
      category: parsed.data.category,
      factKey,
      value: parsed.data.value,
      authorId: ctx.userId,
    },
    update: { value: parsed.data.value, category: parsed.data.category, status: "ACTIVE" },
  });

  await audit({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    action: "memory.fact_upserted",
    entity: "MemoryFact",
    entityId: factKey,
    meta: { category: parsed.data.category },
  });

  revalidatePath("/memory");
}

export async function importMemory(formData: FormData) {
  const ctx = await requireApiContext();
  requirePermission(ctx.role, "memory:write");
  await requireEntitlement(ctx.orgId);

  const text = String(formData.get("importText") ?? "").slice(0, 100_000);
  const { facts, skipped } = parseMemoryImport(text);
  if (facts.length === 0) {
    redirect(`/memory/import?done=0&skipped=${skipped}`);
  }

  const ik = String(formData.get("ik") ?? "").trim();
  if (!/^[a-f0-9]{16,64}$/.test(ik)) {
    throw new Error("Your session form expired. Reload the page and try again.");
  }

  const outcome = await withIdempotency(ctx.orgId, "memory.import", ik, async (tx) => {
    for (const f of facts) {
      await tx.memoryFact.upsert({
        where: { orgId_factKey: { orgId: ctx.orgId, factKey: f.factKey } },
        create: {
          orgId: ctx.orgId,
          category: f.category,
          factKey: f.factKey,
          value: f.value,
          authorId: ctx.userId,
        },
        update: { value: f.value, category: f.category, status: "ACTIVE" },
      });
    }
    return { id: `import-${facts.length}` };
  });

  if (outcome.kind === "created") {
    await audit({
      orgId: ctx.orgId,
      actorId: ctx.userId,
      action: "memory.imported",
      entity: "MemoryFact",
      entityId: outcome.entityId,
      meta: { count: facts.length },
    });
  }

  revalidatePath("/memory");
  redirect(`/memory/import?done=${facts.length}&skipped=${skipped}`);
}

export async function setMemoryFactStatus(formData: FormData) {
  const ctx = await requireApiContext();
  requirePermission(ctx.role, "memory:write");
  await requireEntitlement(ctx.orgId);

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!["ACTIVE", "ARCHIVED"].includes(status)) throw new Error("Invalid status");

  const fact = await prisma.memoryFact.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!fact) throw new Error("Memory fact not found");

  await prisma.memoryFact.update({ where: { id }, data: { status: status as never } });
  await audit({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    action: status === "ARCHIVED" ? "memory.fact_archived" : "memory.fact_restored",
    entity: "MemoryFact",
    entityId: id,
  });
  revalidatePath("/memory");
}

// ── Memory questions ─────────────────────────────────────────────────────────

const askSchema = z.object({
  question: z.string().trim().min(3, "Question is too short").max(300),
});

export async function askMemoryQuestion(formData: FormData) {
  const ctx = await requireApiContext();
  requirePermission(ctx.role, "memory:write");
  await requireEntitlement(ctx.orgId);

  const parsed = askSchema.safeParse({ question: formData.get("question") });
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }

  const q = await prisma.memoryQuestion.create({
    data: { orgId: ctx.orgId, question: parsed.data.question, askerId: ctx.userId },
  });

  await audit({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    action: "memory.question_asked",
    entity: "MemoryQuestion",
    entityId: q.id,
  });

  revalidatePath("/memory/questions");
}

export async function answerMemoryQuestion(formData: FormData) {
  const ctx = await requireApiContext();
  requirePermission(ctx.role, "memory:write");
  await requireEntitlement(ctx.orgId);

  const id = String(formData.get("id") ?? "");
  const answer = String(formData.get("answer") ?? "").trim().slice(0, 2000);
  if (!answer) throw new Error("Answer is required");

  const q = await prisma.memoryQuestion.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!q) throw new Error("Question not found");

  await prisma.memoryQuestion.update({
    where: { id },
    data: { answer, state: "ANSWERED" },
  });

  await audit({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    action: "memory.question_answered",
    entity: "MemoryQuestion",
    entityId: id,
  });

  revalidatePath("/memory/questions");
}

export async function deleteMemoryQuestion(formData: FormData) {
  const ctx = await requireApiContext();
  requirePermission(ctx.role, "memory:write");
  await requireEntitlement(ctx.orgId);
  const id = String(formData.get("id") ?? "");
  const q = await prisma.memoryQuestion.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!q) throw new Error("Question not found");
  await prisma.memoryQuestion.delete({ where: { id } });
  await audit({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    action: "memory.question_deleted",
    entity: "MemoryQuestion",
    entityId: id,
  });
  revalidatePath("/memory/questions");
}
