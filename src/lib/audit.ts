import { prisma } from "@/lib/db";

/**
 * Audit trail (OBSERVABILITY.md §Audit).
 * Never log secrets or PII beyond actor/entity identity — callers pass
 * already-redacted metadata.
 */
export async function audit(input: {
  orgId: string;
  actorId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  meta?: Record<string, unknown>;
  ip?: string | null;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        orgId: input.orgId,
        actorId: input.actorId ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        metaJson: JSON.stringify(input.meta ?? {}),
        ip: input.ip ?? null,
      },
    });
  } catch (err) {
    // Audit must never break the request path; surface via stderr instead.
    console.error("[audit] failed to persist audit event", err);
  }
}
