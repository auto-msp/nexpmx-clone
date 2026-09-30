"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireApiContext } from "@/lib/api";
import { requirePermission } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { requireEntitlement, checkStorageEntitlement } from "@/lib/entitlements";
import { storage } from "@/lib/storage";
import {
  MAX_UPLOAD_BYTES,
  resolveMimeType,
  safeDisplayName,
} from "@/lib/documents";

/**
 * Document Hub actions (KNOWN_LIMITATIONS #1).
 *
 * Enforcement order per ARCHITECTURE.md:
 *   session → RBAC → zod → ownership re-check → entitlement → write → audit
 *
 * The file itself never touches the database: bytes go to the storage
 * adapter under a random org-scoped key; Prisma stores metadata only.
 */

export async function uploadDocument(formData: FormData): Promise<void> {
  const ctx = await requireApiContext();
  requirePermission(ctx.role, "document:write");
  await requireEntitlement(ctx.orgId);

  const title = String(formData.get("title") ?? "").trim();
  const projectId = String(formData.get("projectId") ?? "").trim();
  const clientId = String(formData.get("clientId") ?? "").trim();
  const file = formData.get("file");

  if (title.length === 0 || title.length > 200) {
    throw new Error("Title must be between 1 and 200 characters");
  }
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Choose a file to upload");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("File exceeds the 25 MB upload limit");
  }

  // Content-type negotiation: declared type first, extension as fallback.
  const mime = resolveMimeType(file.type, file.name);
  if (!mime) {
    throw new Error(
      "File type not allowed. Allowed: pdf, images, txt, csv, json, zip, docx, xlsx, pptx.",
    );
  }

  // Optional FKs are re-verified against the org (IDOR defense).
  let projectIdResolved: string | null = null;
  if (projectId) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, orgId: ctx.orgId },
      select: { id: true },
    });
    if (!project) throw new Error("Project not found in your organization");
    projectIdResolved = project.id;
  }
  let clientIdResolved: string | null = null;
  if (clientId) {
    const client = await prisma.client.findFirst({
      where: { id: clientId, orgId: ctx.orgId },
      select: { id: true },
    });
    if (!client) throw new Error("Client not found in your organization");
    clientIdResolved = client.id;
  }

  // Plan storage cap BEFORE any bytes are written (RULE-ENT-03).
  const entitlement = await checkStorageEntitlement(ctx.orgId, file.size);
  if (!entitlement.allowed) {
    throw new Error(
      entitlement.reason === "storage_full"
        ? `Storage limit reached for your ${entitlement.planName} plan (${entitlement.storageMb} MB). Delete files or upgrade to continue.`
        : "Upload not allowed on your plan",
    );
  }

  const data = Buffer.from(await file.arrayBuffer());

  // Defense in depth: re-verify size after buffering (stream could drift),
  // then store. Reject before the DB row exists on any failure.
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

  const doc = await prisma.document.create({
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

  await audit({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    action: "document.uploaded",
    entity: "Document",
    entityId: doc.id,
    meta: {
      title: doc.title,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
    },
  });

  revalidatePath("/documents");
}

export async function deleteDocument(formData: FormData): Promise<void> {
  const ctx = await requireApiContext();
  requirePermission(ctx.role, "document:write");
  await requireEntitlement(ctx.orgId);

  const id = String(formData.get("id") ?? "");
  const doc = await prisma.document.findFirst({
    where: { id, orgId: ctx.orgId },
    select: { id: true, title: true, storageKey: true },
  });
  if (!doc) throw new Error("Document not found");

  await prisma.document.delete({ where: { id: doc.id } });
  await storage.delete(doc.storageKey);

  await audit({
    orgId: ctx.orgId,
    actorId: ctx.userId,
    action: "document.deleted",
    entity: "Document",
    entityId: doc.id,
    meta: { title: doc.title },
  });

  revalidatePath("/documents");
}
