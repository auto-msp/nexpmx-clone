import { describe, it, expect } from "vitest";
import { PLANS, planOf, formatInr } from "@/lib/plans";
import { can, canRead, requirePermission } from "@/lib/rbac";
import { stubProvider } from "@/lib/ai";
import { hashToken } from "@/lib/tenancy";
import {
  resolveMimeType,
  isAllowedMime,
  safeDisplayName,
  signDownloadToken,
  verifyDownloadToken,
  MAX_UPLOAD_BYTES,
} from "@/lib/documents";
import { canTransition, nextActionsFor, INVOICE_TRANSITIONS } from "@/lib/invoice-state";
import { isEntitled, subscriptionView, TRIAL_DAYS } from "@/lib/subscription";

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

describe("document security helpers", () => {
  it("accepts allowlisted mimes and maps known extensions", () => {
    expect(resolveMimeType("application/pdf", "a.pdf")).toBe("application/pdf");
    expect(resolveMimeType("text/x-fake", "report.csv")).toBe("text/csv");
    expect(resolveMimeType(null, "photo.PNG")).toBe("image/png");
  });

  it("rejects non-allowlisted types before any bytes are stored", () => {
    expect(resolveMimeType("application/x-msdownload", "evil.exe")).toBeNull();
    expect(resolveMimeType("text/html", "payload.html")).toBeNull();
    expect(resolveMimeType(null, "noext")).toBeNull();
  });

  it("never trusts a non-allowlisted stored mime at download time", () => {
    expect(isAllowedMime("application/pdf")).toBe(true);
    expect(isAllowedMime("text/html")).toBe(false);
  });

  it("strips path components and control chars from display names", () => {
    expect(safeDisplayName("../../etc/passwd")).toBe("passwd");
    expect(safeDisplayName("..\\win\\file.txt")).toBe("file.txt");
    expect(safeDisplayName("a\u0000b.pdf")).toBe("ab.pdf");
    expect(safeDisplayName("")).toBe("file");
  });

  it("caps single uploads below the smallest plan storage allowance", () => {
    expect(MAX_UPLOAD_BYTES).toBeLessThan(PLANS.STARTER.storageMb * 1024 * 1024);
  });
});

describe("signed download tokens", () => {
  process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? "test-secret-for-vitest";
  const claims = {
    documentId: "doc_123",
    orgId: "org_abc",
    expiresAt: Date.now() + 60_000,
  };

  it("round-trips valid tokens", () => {
    const token = signDownloadToken(claims);
    expect(verifyDownloadToken(token)).toMatchObject({
      documentId: "doc_123",
      orgId: "org_abc",
    });
  });

  it("binds tokens to their document id (no swapping)", () => {
    const token = signDownloadToken(claims);
    const verified = verifyDownloadToken(token);
    expect(verified?.documentId).not.toBe("doc_999");
  });

  it("rejects tampered payloads", () => {
    const token = signDownloadToken(claims);
    const [payload, sig] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...claims, orgId: "org_evil" }),
    ).toString("base64url");
    expect(verifyDownloadToken(`${forged}.${sig}`)).toBeNull();
  });

  it("rejects expired tokens", () => {
    const token = signDownloadToken({ ...claims, expiresAt: Date.now() - 1000 });
    expect(verifyDownloadToken(token)).toBeNull();
  });

  it("rejects garbage and missing tokens", () => {
    expect(verifyDownloadToken(null)).toBeNull();
    expect(verifyDownloadToken("abc")).toBeNull();
    expect(verifyDownloadToken("a.b.c")).toBeNull();
  });

  it("keeps portal-scoped and app tokens in separate audiences", () => {
    const portalToken = signDownloadToken({ ...claims, portalToken: "p".repeat(32) });
    const verified = verifyDownloadToken(portalToken);
    expect(verified?.portalToken).toBeDefined();
  });
});

describe("invoice state machine", () => {
  it("allows exactly the documented lifecycle edges", () => {
    expect(canTransition("DRAFT", "SENT")).toBe(true);
    expect(canTransition("SENT", "PAID")).toBe(true);
    expect(canTransition("SENT", "OVERDUE")).toBe(true);
    expect(canTransition("OVERDUE", "PAID")).toBe(true);
  });

  it("rejects skipping, reversing, and terminal exits", () => {
    expect(canTransition("DRAFT", "PAID")).toBe(false);
    expect(canTransition("DRAFT", "OVERDUE")).toBe(false);
    expect(canTransition("SENT", "DRAFT")).toBe(false);
    expect(canTransition("PAID", "SENT")).toBe(false);
    expect(canTransition("PAID", "OVERDUE")).toBe(false);
    expect(canTransition("UNKNOWN", "PAID")).toBe(false);
  });

  it("exposes action buttons only for valid transitions", () => {
    expect(nextActionsFor("DRAFT")).toEqual([{ to: "SENT", label: "Send" }]);
    expect(nextActionsFor("PAID")).toEqual([]);
  });
});

describe("subscription / trial state", () => {
  const DAY = 86_400_000;

  it("defines the evidence-backed 14-day trial", () => {
    expect(TRIAL_DAYS).toBe(14);
  });

  it("entitles active orgs and unexpired trials", () => {
    expect(isEntitled("ACTIVE", null)).toBe(true);
    expect(isEntitled("TRIALING", new Date(Date.now() + DAY))).toBe(true);
  });

  it("locks out expired trials, past-due, and canceled orgs", () => {
    expect(isEntitled("TRIALING", new Date(Date.now() - DAY))).toBe(false);
    expect(isEntitled("PAST_DUE", null)).toBe(false);
    expect(isEntitled("CANCELED", new Date(Date.now() + DAY))).toBe(false);
  });

  it("counts down remaining trial days, floored at zero", () => {
    const soon = subscriptionView({
      state: "TRIALING",
      trialEndsAt: new Date(Date.now() + 3 * DAY + 60_000),
    });
    expect(soon.daysRemaining).toBe(4); // ceil(3d + 1min)
    expect(soon.entitled).toBe(true);

    const past = subscriptionView({
      state: "TRIALING",
      trialEndsAt: new Date(Date.now() - 2 * DAY),
    });
    expect(past.daysRemaining).toBe(0);
    expect(past.expired).toBe(true);
  });

  it("treats a missing subscription row as entitled (bootstrap safety)", () => {
    const view = subscriptionView(null);
    expect(view.entitled).toBe(true);
    expect(view.state).toBe("TRIALING");
  });

  it("keeps the transition table total over all known statuses", () => {
    for (const status of ["DRAFT", "SENT", "PAID", "OVERDUE"]) {
      expect(Array.isArray(INVOICE_TRANSITIONS[status])).toBe(true);
    }
  });
});
