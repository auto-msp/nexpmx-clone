import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";

/**
 * Server-side idempotency for create operations.
 *
 * Contract: the form posts a random `ik` field (generated when the form is
 * rendered). The first submission claims the key and creates the record
 * inside ONE transaction — so the claim is atomic with the write. A retried
 * submission (double-click, network retry after lost response) with the same
 * key replays the original result instead of creating a second row.
 *
 * Replay is only safe for retries of the SAME logical operation, which the
 * unique (orgId, scope, key) constraint guarantees: keys are per-org,
 * per-scope, and generated fresh per rendered form.
 */

/** New idempotency key for embedding in a rendered form. */
export function newIdempotencyKey(): string {
  return randomBytes(16).toString("hex");
}

export type IdempotentOutcome =
  | { kind: "created"; entityId: string }
  | { kind: "replayed"; entityId: string };

/**
 * Claim the key and run `create` in one transaction.
 * - Fresh key  → runs create, records the claim, returns "created".
 * - Known key  → returns "replayed" with the original entity id without
 *                running create again.
 *
 * `create` receives the transaction client; it MUST not commit anything
 * outside the transaction or perform external side effects (emails, uploads)
 * — replay would skip those.
 */
export async function withIdempotency<T extends { id: string }>(
  orgId: string,
  scope: string,
  key: string,
  create: (tx: PrismaTransaction) => Promise<T>,
): Promise<IdempotentOutcome> {
  const claim = { orgId, scope, key };
  try {
    return await prisma.$transaction(
      async (tx) => {
        const existing = await tx.idempotencyKey.findUnique({
          where: { orgId_scope_key: claim },
          select: { entityId: true },
        });
        if (existing) {
          return { kind: "replayed" as const, entityId: existing.entityId };
        }
        const entity = await create(tx);
        await tx.idempotencyKey.create({
          data: { ...claim, entityId: entity.id },
        });
        return { kind: "created" as const, entityId: entity.id };
      },
      { isolationLevel: "Serializable" },
    );
  } catch (err) {
    // Two racing retries of the same key: the loser replays.
    if ((err as { code?: string })?.code === "P2002") {
      const winner = await prisma.idempotencyKey.findUnique({
        where: { orgId_scope_key: claim },
        select: { entityId: true },
      });
      if (winner) return { kind: "replayed", entityId: winner.entityId };
    }
    // Serializable conflict: one bounded retry (re-runs the whole check).
    if ((err as { code?: string })?.code === "P2034") {
      return prisma.$transaction(
        async (tx) => {
          const existing = await tx.idempotencyKey.findUnique({
            where: { orgId_scope_key: claim },
            select: { entityId: true },
          });
          if (existing) {
            return { kind: "replayed" as const, entityId: existing.entityId };
          }
          const entity = await create(tx);
          await tx.idempotencyKey.create({
            data: { ...claim, entityId: entity.id },
          });
          return { kind: "created" as const, entityId: entity.id };
        },
        { isolationLevel: "Serializable" },
      );
    }
    throw err;
  }
}

/** Minimal transaction-client type (avoids importing Prisma namespace). */
type PrismaTransaction = Parameters<
  Parameters<typeof prisma.$transaction>[0]
>[0];

/**
 * Retention: keys older than 30 days are irrelevant for retry protection
 * (real network retries resolve in seconds/minutes). Called opportunistically;
 * failure is logged and never breaks the request path.
 */
const RETENTION_DAYS = 30;

export async function pruneIdempotencyKeys(): Promise<number> {
  try {
    const res = await prisma.idempotencyKey.deleteMany({
      where: {
        createdAt: { lt: new Date(Date.now() - RETENTION_DAYS * 86_400_000) },
      },
    });
    return res.count;
  } catch (err) {
    console.error("[idempotency] prune failed", err);
    return 0;
  }
}
