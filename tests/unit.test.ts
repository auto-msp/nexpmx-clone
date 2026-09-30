import { describe, it, expect } from "vitest";
import { PLANS, planOf, formatInr } from "@/lib/plans";
import { can, canRead, requirePermission } from "@/lib/rbac";
import { stubProvider } from "@/lib/ai";
import { hashToken } from "@/lib/tenancy";

describe("plans", () => {
  it("exposes three tiers with increasing credit allowances", () => {
    const ids = Object.keys(PLANS);
    expect(ids).toEqual(["STARTER", "GROWTH", "SCALE"]);
    expect(PLANS.STARTER.aiCreditsPerMonth).toBeLessThan(PLANS.GROWTH.aiCreditsPerMonth);
    expect(PLANS.GROWTH.aiCreditsPerMonth).toBeLessThan(PLANS.SCALE.aiCreditsPerMonth);
  });

  it("enforces the observed seat caps pattern (10 / 50 / unlimited)", () => {
    expect(PLANS.STARTER.maxSeats).toBe(10);
    expect(PLANS.GROWTH.maxSeats).toBe(50);
    expect(PLANS.SCALE.maxSeats).toBeNull();
  });

  it("falls back to Starter for unknown plan ids", () => {
    expect(planOf("NOPE").id).toBe("STARTER");
    expect(planOf(null).id).toBe("STARTER");
  });

  it("formats INR from minor units", () => {
    expect(formatInr(49900)).toBe("₹499");
  });
});

describe("rbac", () => {
  it("gives OWNER org management but not MEMBER", () => {
    expect(can("OWNER", "org:manage")).toBe(true);
    expect(can("MEMBER", "org:manage")).toBe(false);
  });

  it("allows MEMBER to write projects but not invoices", () => {
    expect(can("MEMBER", "project:write")).toBe(true);
    expect(can("MEMBER", "invoice:write")).toBe(false);
  });

  it("allows all members to read", () => {
    for (const role of ["OWNER", "ADMIN", "MANAGER", "MEMBER"]) {
      expect(canRead(role)).toBe(true);
    }
    expect(canRead("CLIENT")).toBe(false);
    expect(canRead("GUEST")).toBe(false);
  });

  it("requirePermission throws a 403-tagged error", () => {
    expect(() => requirePermission("MEMBER", "client:delete")).toThrowError();
    try {
      requirePermission("MEMBER", "client:delete");
    } catch (e) {
      expect((e as { status?: number }).status).toBe(403);
    }
  });
});

describe("ai stub provider", () => {
  const ctx = [
    { kind: "client" as const, title: "Acme Corp", snippet: "Retainer client since 2024" },
    { kind: "project" as const, title: "Acme website revamp", snippet: "Client: Acme Corp" },
    { kind: "invoice" as const, title: "INV-001 · Acme Corp", snippet: "15000 INR · SENT" },
  ];

  it("ranks matching context and returns sources", async () => {
    const res = await stubProvider.answer("What is the status of the Acme project?", ctx);
    expect(res.creditsUsed).toBe(1);
    expect(res.sources.length).toBeGreaterThan(0);
    expect(res.answer).toContain("Acme");
  });

  it("returns a graceful no-match answer with zero credits", async () => {
    const res = await stubProvider.answer("zzzqqq unrelated gibberish", ctx);
    expect(res.sources.length).toBe(0);
    expect(res.creditsUsed).toBe(0);
  });
});

describe("token hashing", () => {
  it("produces a deterministic sha-256 hex digest", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
    expect(hashToken("abc")).toMatch(/^[a-f0-9]{64}$/);
  });
});
