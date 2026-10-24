"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireEntitlement, storageUsedBytes } from "@/lib/entitlements";
import { storage } from "@/lib/storage";
import { planOf } from "@/lib/plans";
import { runAction, fStr, fOpt, type ActionResult } from "@/lib/action";
import { MAX_UPLOAD_BYTES, resolveMimeType, safeDisplayName } from "@/lib/documents";

/**
 * Document Hub actions.
 *
 * Enforcement order: session → RBAC → validation → ownership re-check →
 * entitlement → write → audit. Bytes go to the storage adapter under a random
 * org-scoped key; Prisma stores metadata only. Results are RETURNED (never
 * thrown) so production error masking does not hide validation messages.
 */

export async function uploadDocument(formData: FormData): Promise<ActionResult> {
  return runAction("document:write", async (ctx) => {
    await requireEntitlement(ctx.orgId);

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      throw new Error("Choose a file to upload");
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error("File exceeds the 25 MB upload limit");
    }
    // Title defaults to the file name (without extension) when left blank.
    const fallbackTitle = safeDisplayName(file.name).replace(/\.[^.]+$/, "");
    const title = (fStr(formData, "title") || fallbackTitle).slice(0, 200);
    if (title.length === 0) throw new Error("Give the document a title");

    const mime = resolveMimeType(file.type, file.name);
    if (!mime) {
      throw new Error(
        "File type not allowed. Allowed: pdf, images, txt, csv, json, zip, docx, xlsx, pptx.",
      );
    }

    // Optional links are re-verified against the org (IDOR defence).
    const projectId = fOpt(formData, "projectId");
    const clientId = fOpt(formData, "clientId");
    let projectIdResolved: string | null = null;
    let clientIdResolved: string | null = null;
    if (projectId) {
      const project = await prisma.project.findFirst({
        where: { id: projectId, orgId: ctx.orgId },
        select: { id: true, clientId: true },
      });
      if (!project) throw new Error("Project not found in your workspace");
      projectIdResolved = project.id;
      // A project-linked document inherits the project's client when none was chosen.
      if (!clientId && project.clientId) clientIdResolved = project.clientId;
    }
    if (clientId) {
      const client = await prisma.client.findFirst({
        where: { id: clientId, orgId: ctx.orgId },
        select: { id: true },
      });
      if (!client) throw new Error("Client not found in your workspace");
      clientIdResolved = client.id;
    }

    // Storage cap BEFORE any bytes are written. The cap shown on the hub is the
    // larger of the org's own limit and the plan's allowance.
    const org = await prisma.organization.findUnique({
      where: { id: ctx.orgId },
      select: { plan: true, storageLimitMb: true },
    });
    const plan = planOf(org?.plan);
    const capMb = Math.max(org?.storageLimitMb ?? 0, plan.storageMb);
    const used = await storageUsedBytes(ctx.orgId);
    if (used + file.size > capMb * 1024 * 1024) {
      throw new Error(
        `Storage limit reached (${capMb.toLocaleString("en-IN")} MB on the ${plan.name} plan). Delete files or upgrade to continue.`,
      );
    }

    const data = Buffer.from(await file.arrayBuffer());
    if (data.byteLength !== file.size || data.byteLength > MAX_UPLOAD_BYTES) {
      throw new Error("File size mismatch — upload rejected");
    }

    let stored;
    try {
      stored = await storage.put(ctx.orgId, data);
    } catch (err) {
      console.error("[documents] storage put failed", err);
      throw new Error("Could not store the file. Please try again.");
    }

    let doc;
    try {
      doc = await prisma.document.create({
        data: {
          orgId: ctx.orgId,
          uploaderId: ctx.userId,
          projectId: projectIdResolved,
          clientId: clientIdResolved,
          title,
          mimeType: mime,
          sizeBytes: stored.sizeBytes,
          storageKey: stored.key,
          originalName: safeDisplayName(file.name),
          sha256: stored.sha256,
        },
      });
    } catch (err) {
      // Compensating cleanup: blob written but metadata row was not.
      console.error("[documents] metadata write failed after storage.put", err);
      await storage
        .delete(stored.key)
        .catch((cleanupErr) => console.error("[documents] orphan cleanup failed", stored.key, cleanupErr));
      throw new Error("Could not save the document. Please try again.");
    }

    await audit({
      orgId: ctx.orgId,
      actorId: ctx.userId,
      action: "document.uploaded",
      entity: "Document",
      entityId: doc.id,
      meta: { title: doc.title, mimeType: doc.mimeType, sizeBytes: doc.sizeBytes },
    });

    revalidatePath("/documents");
    return { id: doc.id, message: "Document uploaded" };
  });
}

export async function deleteDocument(formData: FormData): Promise<ActionResult> {
  return runAction("document:write", async (ctx) => {
    await requireEntitlement(ctx.orgId);

    const id = fStr(formData, "id");
    const doc = await prisma.document.findFirst({
      where: { id, orgId: ctx.orgId },
      select: { id: true, title: true, storageKey: true },
    });
    if (!doc) throw new Error("Document not found");

    await prisma.document.delete({ where: { id: doc.id } });
    await storage.delete(doc.storageKey).catch((err) => console.error("[documents] blob delete failed", doc.storageKey, err));

    await audit({
      orgId: ctx.orgId,
      actorId: ctx.userId,
      action: "document.deleted",
      entity: "Document",
      entityId: doc.id,
      meta: { title: doc.title },
    });

    revalidatePath("/documents");
    return { message: "Document deleted" };
  });
}
