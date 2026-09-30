import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "@/lib/db";
import { withIdempotency, newIdempotencyKey, pruneIdempotencyKeys } from "@/lib/idempotency";
import { storage } from "@/lib/storage";
import { validateEnv } from "@/lib/env";

// Shared writable temp dir for env-validation and stream tests.
const tmp = mkdtempSync(path.join(tmpdir(), "bizmemory-followups-"));

// ── Idempotency keys (server-side duplicate protection) ─────────────────────

describe("idempotency: withIdempotency", () => {
  const suffix = Date.now();
  let orgId: string;
  let userId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: `idem-${suffix}@example.com` },
    });
    userId = user.id;
    const org = await prisma.organization.create({
      data: { name: "Idem Org", slug: `idem-${suffix}`, plan: "STARTER" },
    });
    orgId = org.id;
    await prisma.membership.create({ data: { userId, orgId, role: "OWNER" } });
  });

  afterAll(async () => {
    await prisma.organization.delete({ where: { id: orgId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("creates once and replays the same entity on retry", async () => {
    const key = newIdempotencyKey();
    let createCalls = 0;

    const run = () =>
      withIdempotency(orgId, "test.op", key, async (tx) => {
        createCalls++;
        return tx.client.create({
          data: {
            orgId,
            name: `Idem Client ${suffix}`,
            portalToken: `ik${suffix}${Math.random().toString(16).slice(2, 26)}`,
          },
          select: { id: true },
        });
      });

    const first = await run();
    expect(first.kind).toBe("created");

    const retry = await run();
    expect(retry.kind).toBe("replayed");
    expect(retry.entityId).toBe(first.entityId);
    expect(createCalls).toBe(1); // create ran exactly once

    const rows = await prisma.client.count({
      where: { orgId, name: `Idem Client ${suffix}` },
    });
    expect(rows).toBe(1); // no duplicate row
  });

  it("scopes keys per org+scope (same key, different scope creates)", async () => {
    const key = newIdempotencyKey();
    const a = await withIdempotency(orgId, "scope.a", key, async (tx) =>
      tx.decision.create({
        data: { orgId, authorId: userId, title: "A", body: "a" },
        select: { id: true },
      }),
    );
    const b = await withIdempotency(orgId, "scope.b", key, async (tx) =>
      tx.decision.create({
        data: { orgId, authorId: userId, title: "B", body: "b" },
        select: { id: true },
      }),
    );
    expect(a.kind).toBe("created");
    expect(b.kind).toBe("created");
    expect(b.entityId).not.toBe(a.entityId);
  });

  it("does not run create when the key was already claimed", async () => {
    const key = newIdempotencyKey();
    // Claim only — pass a create that would fail loudly if executed.
    await prisma.idempotencyKey.create({
      data: { orgId, scope: "preclaimed", key, entityId: "entity-123" },
    });
    const outcome = await withIdempotency(
      orgId,
      "preclaimed",
      key,
      async () => {
        throw new Error("create must not run on replay");
      },
    );
    expect(outcome).toEqual({ kind: "replayed", entityId: "entity-123" });
  });

  it("pruneIdempotencyKeys never throws and returns a count", async () => {
    await expect(pruneIdempotencyKeys()).resolves.toEqual(
      expect.any(Number),
    );
  });
});

// ── Streaming downloads ──────────────────────────────────────────────────────

describe("storage.getStream round-trip", () => {
  const ORG = "c" + "b".repeat(23);

  it("streams exact bytes for a file larger than one chunk", async () => {
    // ~1.5 MB patterned payload (stream chunks default to 64 KB).
    const payload = Buffer.alloc(1_500_000);
    for (let i = 0; i < payload.length; i++) payload[i] = i % 251;
    const stored = await storage.put(ORG, payload);
    try {
      const stat = await storage.stat(stored.key);
      expect(stat?.sizeBytes).toBe(payload.length);

      const stream = await storage.getStream(stored.key);
      const chunks: Uint8Array[] = [];
      const reader = stream.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const received = Buffer.concat(chunks.map((c) => Buffer.from(c)));
      expect(received.equals(payload)).toBe(true);
      expect(chunks.length).toBeGreaterThan(1); // actually streamed, not one blob
    } finally {
      await storage.delete(stored.key);
    }
  });

  it("rejects invalid keys before touching the filesystem", async () => {
    await expect(storage.getStream("../../etc/passwd")).rejects.toThrow(
      "Invalid storage key",
    );
  });
});

// ── Fail-fast env validation ─────────────────────────────────────────────────

describe("env validation", () => {
  it("reports missing DATABASE_URL and AUTH_SECRET", () => {
    const problems = validateEnv({
      NODE_ENV: "production",
      DOCUMENT_STORAGE_DIR: tmp, // writable temp dir
    });
    const vars = problems.map((p) => p.var);
    expect(vars).toContain("DATABASE_URL");
    expect(vars).toContain("AUTH_SECRET");
  });

  it("requires OAuth credentials only in production", () => {
    const prod = validateEnv({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://x",
      AUTH_SECRET: "s",
      DOCUMENT_STORAGE_DIR: tmp,
    });
    expect(prod.some((p) => p.var.includes("AUTH_GOOGLE"))).toBe(true);

    const dev = validateEnv({
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://x",
      AUTH_SECRET: "s",
      DOCUMENT_STORAGE_DIR: tmp,
    });
    expect(dev.some((p) => p.var.includes("AUTH_GOOGLE"))).toBe(false);
  });

  it("flags an unwritable document storage dir", () => {
    const problems = validateEnv({
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://x",
      AUTH_SECRET: "s",
      DOCUMENT_STORAGE_DIR: "/nonexistent/path/for/env-test",
    });
    expect(problems.some((p) => p.var === "DOCUMENT_STORAGE_DIR")).toBe(true);
  });

  it("passes with a complete, usable environment", () => {
    expect(
      validateEnv({
        NODE_ENV: "development",
        DATABASE_URL: "postgresql://x",
        AUTH_SECRET: "s",
        DOCUMENT_STORAGE_DIR: tmp,
      }),
    ).toEqual([]);
  });
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});
