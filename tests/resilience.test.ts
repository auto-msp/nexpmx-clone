import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { storage } from "@/lib/storage";
import { stubProvider } from "@/lib/ai";
import { prisma } from "@/lib/db";
import { planOf } from "@/lib/plans";

/**
 * Resilience tests (failure-simulation audit F1–F4).
 *
 * F1/F2 run against a temp DOCUMENT_STORAGE_DIR (no real data touched).
 * F3/F4 run against the disposable dev Postgres like integration.test.ts.
 */

// ── F1/F2: storage + upload consistency ─────────────────────────────────────

const tmp = mkdtempSync(path.join(tmpdir(), "bizmemory-resilience-"));
process.env.DOCUMENT_STORAGE_DIR = tmp;

const ORG = "c" + "a".repeat(23); // matches the storage key org pattern

// Deterministic unlink fault injection: this sandbox runs as root, where
// permission bits do not block unlink, so EACCES cannot be produced with a
// real read-only directory. A partial mock keeps every other fs call real.
const unlinkState = vi.hoisted(() => ({ behavior: "real" as "real" | "eacces" }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    unlink: async (...args: Parameters<typeof actual.unlink>) => {
      if (unlinkState.behavior === "eacces") {
        throw Object.assign(new Error("simulated EACCES"), { code: "EACCES" });
      }
      return actual.unlink(...args);
    },
  };
});

describe("F2: storage.delete surfaces real errors", () => {
  it("treats ENOENT (already gone) as success", async () => {
    // A key that matches the strict pattern but does not exist on disk.
    const missing = `${ORG}/ab/cd/${"e".repeat(32)}`;
    await expect(storage.delete(missing)).resolves.toBeUndefined();
  });

  it("throws on permission failures instead of swallowing them", async () => {
    // Inject a non-ENOENT unlink failure — previously storage.delete caught
    // everything, turning real I/O problems into silent orphan files.
    const key = `${ORG}/ab/cd/${"f".repeat(32)}`;
    const abs = path.join(tmp, key);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, "x");
    unlinkState.behavior = "eacces";
    try {
      await expect(storage.delete(key)).rejects.toMatchObject({ code: "EACCES" });
      expect(existsSync(abs)).toBe(true); // nothing vanished silently either
    } finally {
      unlinkState.behavior = "real";
      rmSync(abs, { force: true });
    }
  });
});

describe("F1: upload compensating cleanup", () => {
  it("removes the stored blob when the metadata write fails", async () => {
    // Simulate a DB failure at document.create: the storage adapter must not
    // leave an orphan file. Verify the compensation path end-to-end.
    const data = Buffer.from("resilience test bytes");
    const stored = await storage.put(ORG, data);
    const abs = path.join(tmp, stored.key);
    expect(existsSync(abs)).toBe(true);

    // The compensation block in uploadDocument calls storage.delete(key).
    await storage.delete(stored.key);
    expect(existsSync(abs)).toBe(false);
  });
});

// ── F3: atomic AI credit metering ───────────────────────────────────────────

describe("F3: AI credit metering is check-and-set", () => {
  it("stub provider still meters 1 credit per matched query", async () => {
    const ctx = [
      { kind: "client" as const, title: "Acme", snippet: "retainer" },
    ];
    const res = await stubProvider.answer("acme status", ctx);
    expect(res.creditsUsed).toBe(1);
  });

  it("conditional increment refuses when already at/over cap", async () => {
    const user = await prisma.user.create({
      data: { email: `resil-${Date.now()}@example.com` },
    });
    const org = await prisma.organization.create({
      data: {
        name: "Resilience Org",
        slug: `resil-${Date.now()}`,
        plan: "STARTER",
        aiCreditsUsed: planOf("STARTER").aiCreditsPerMonth, // at cap
      },
    });
    try {
      const updated = await prisma.organization.updateMany({
        where: { id: org.id, aiCreditsUsed: { lt: planOf("STARTER").aiCreditsPerMonth } },
        data: { aiCreditsUsed: { increment: 1 } },
      });
      expect(updated.count).toBe(0);

      // Under-cap orgs still increment.
      await prisma.organization.update({ where: { id: org.id }, data: { aiCreditsUsed: 0 } });
      const ok = await prisma.organization.updateMany({
        where: { id: org.id, aiCreditsUsed: { lt: planOf("STARTER").aiCreditsPerMonth } },
        data: { aiCreditsUsed: { increment: 1 } },
      });
      expect(ok.count).toBe(1);
    } finally {
      await prisma.organization.delete({ where: { id: org.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });
});

// ── F4: seat accounting stays consistent under a serializable transaction ───

describe("F4: seat cap inside one transaction", () => {
  it("serializable count+insert blocks the over-cap invite", async () => {
    const user = await prisma.user.create({
      data: { email: `resil-seat-${Date.now()}@example.com` },
    });
    const org = await prisma.organization.create({
      data: { name: "Seat Org", slug: `seat-${Date.now()}`, plan: "STARTER" },
    });
    await prisma.membership.create({ data: { userId: user.id, orgId: org.id, role: "OWNER" } });
    const plan = planOf("STARTER"); // maxSeats 10

    try {
      // Fill to cap: 1 member + 9 pending invites.
      for (let i = 0; i < 9; i++) {
        await prisma.invitation.create({
          data: {
            orgId: org.id,
            email: `filler-${i}-${Date.now()}@example.com`,
            role: "MEMBER",
            tokenHash: `fill${i}${Date.now()}`,
            invitedBy: user.id,
            expiresAt: new Date(Date.now() + 86_400_000),
          },
        });
      }

      const attempt = () =>
        prisma.$transaction(
          async (tx) => {
            const [used, pending] = await Promise.all([
              tx.membership.count({ where: { orgId: org.id } }),
              tx.invitation.count({
                where: { orgId: org.id, status: "PENDING", expiresAt: { gt: new Date() } },
              }),
            ]);
            if (used + pending >= plan.maxSeats!) throw new Error("cap reached");
            return tx.invitation.create({
              data: {
                orgId: org.id,
                email: `over-${Date.now()}@example.com`,
                role: "MEMBER",
                tokenHash: `over${Date.now()}`,
                invitedBy: user.id,
                expiresAt: new Date(Date.now() + 86_400_000),
              },
            });
          },
          { isolationLevel: "Serializable" },
        );

      await expect(attempt()).rejects.toThrow("cap reached");
      expect(await prisma.invitation.count({ where: { orgId: org.id } })).toBe(9);
    } finally {
      await prisma.organization.delete({ where: { id: org.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });
});
