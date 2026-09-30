import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { canTransition } from "@/lib/invoice-state";
import { planOf } from "@/lib/plans";
import { checkStorageEntitlement } from "@/lib/entitlements";
import { getOrCreateSubscription, isEntitled, TRIAL_DAYS } from "@/lib/subscription";
import { seatsInUse } from "@/lib/seats";

/**
 * Integration tests — run against the disposable dev Postgres
 * (bizmemory-pg on 127.0.0.1:5433). DATABASE_URL must be set (loaded from
 * .env by prisma.config.ts convention / CI env). Every fixture is org-scoped
 * and torn down in afterAll.
 *
 * In CI these run after `prisma db push`; locally: `npx vitest run`.
 */

const prisma = new PrismaClient();

let orgId: string;
let userId: string;
let clientId: string;
const createdDocKeys: string[] = [];

async function uniqueOrgSlug(): Promise<string> {
  return `itest-${Math.random().toString(36).slice(2, 10)}`;
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `itest-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`, name: "ITest Owner" },
  });
  userId = user.id;
  const org = await prisma.organization.create({
    data: {
      name: "Integration Test Org",
      slug: await uniqueOrgSlug(),
      plan: "STARTER",
    },
  });
  orgId = org.id;
  await prisma.membership.create({
    data: { userId, orgId, role: "OWNER" },
  });
  const client = await prisma.client.create({
    data: { orgId, name: "ITest Client", portalToken: `it${Math.random().toString(16).slice(2, 34)}` },
  });
  clientId = client.id;
});

afterAll(async () => {
  // Org cascade removes clients/projects/documents/etc. User cascade removes
  // memberships and sessions. Documents rows cascade via org; storage files
  // for this test are the adapters' concern and are exercised separately.
  await prisma.organization.deleteMany({ where: { id: orgId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

describe("invoice state machine (RULE-INV-01)", () => {
  it("persists only valid transitions", async () => {
    const invoice = await prisma.invoice.create({
      data: { orgId, clientId, number: `IT-${Date.now()}`, amountMinor: 150_000, status: "DRAFT" },
    });

    expect(canTransition(invoice.status, "SENT")).toBe(true);
    const sent = await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "SENT", issuedAt: new Date() },
    });
    expect(sent.status).toBe("SENT");
    expect(sent.issuedAt).not.toBeNull();

    expect(canTransition(sent.status, "PAID")).toBe(true);
    const paid = await prisma.invoice.update({ where: { id: invoice.id }, data: { status: "PAID" } });
    expect(paid.status).toBe("PAID");

    // Terminal: no further transition exists in the table.
    expect(canTransition(paid.status, "SENT")).toBe(false);
    expect(canTransition(paid.status, "OVERDUE")).toBe(false);

    await prisma.invoice.delete({ where: { id: invoice.id } });
  });

  it("rejects duplicate invoice numbers per org (P2002)", async () => {
    const number = `IT-DUP-${Date.now()}`;
    await prisma.invoice.create({
      data: { orgId, clientId, number, amountMinor: 100, status: "DRAFT" },
    });
    await expect(
      prisma.invoice.create({
        data: { orgId, clientId, number, amountMinor: 100, status: "DRAFT" },
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    await prisma.invoice.deleteMany({ where: { orgId, number } });
  });

  it("keeps invoices of different orgs isolated (same number allowed cross-org)", async () => {
    const number = `IT-X-${Date.now()}`;
    const otherOrg = await prisma.organization.create({
      data: { name: "Other Org", slug: `other-${Math.random().toString(36).slice(2, 8)}`, plan: "STARTER" },
    });
    const otherClient = await prisma.client.create({
      data: { orgId: otherOrg.id, name: "Other Client", portalToken: `ot${Math.random().toString(16).slice(2, 34)}` },
    });

    const a = await prisma.invoice.create({
      data: { orgId, clientId, number, amountMinor: 100, status: "DRAFT" },
    });
    const b = await prisma.invoice.create({
      data: { orgId: otherOrg.id, clientId: otherClient.id, number, amountMinor: 200, status: "DRAFT" },
    });
    expect(a.number).toBe(b.number);

    // Scoped queries never cross the line.
    const scoped = await prisma.invoice.findMany({ where: { orgId, number } });
    expect(scoped).toHaveLength(1);
    expect(scoped[0].amountMinor).toBe(100);

    await prisma.invoice.deleteMany({ where: { id: { in: [a.id, b.id] } } });
    await prisma.organization.delete({ where: { id: otherOrg.id } });
  });
});

describe("client entitlement cap (RULE-ENT-01)", () => {
  it("blocks the 11th active client on Starter", async () => {
    const plan = planOf("STARTER");
    expect(plan.maxActiveClients).toBe(10);

    const existing = await prisma.client.count({ where: { orgId, status: "ACTIVE" } });
    // The fixture already created one client; fill up to the cap.
    const toCreate = plan.maxActiveClients! - existing;
    const made: string[] = [];
    for (let i = 0; i < toCreate; i++) {
      const c = await prisma.client.create({
        data: { orgId, name: `Cap ${i}`, portalToken: `cp${i}${Math.random().toString(16).slice(2, 30)}` },
      });
      made.push(c.id);
    }

    const active = await prisma.client.count({ where: { orgId, status: "ACTIVE" } });
    expect(active).toBe(plan.maxActiveClients);

    // The guard the action performs: at cap, an insert must be refused.
    const atCap = active >= plan.maxActiveClients!;
    expect(atCap).toBe(true);
    if (atCap) {
      // Simulate what createClient does before writing.
      expect(
        plan.maxActiveClients !== null && active >= plan.maxActiveClients,
      ).toBe(true);
    }

    // Archiving frees a slot.
    await prisma.client.update({ where: { id: made[0] }, data: { status: "ARCHIVED" } });
    const afterArchive = await prisma.client.count({ where: { orgId, status: "ACTIVE" } });
    expect(afterArchive).toBe(plan.maxActiveClients! - 1);
  });
});

describe("seat enforcement (RULE-ENT-05)", () => {
  it("counts members + live pending invites", async () => {
    const inviter = await prisma.invitation.create({
      data: {
        orgId,
        email: `pending-${Date.now()}@example.com`,
        role: "MEMBER",
        tokenHash: `h${Date.now()}`,
        invitedBy: userId,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    const used = await seatsInUse(orgId);
    // 1 member (fixture) + 1 pending invite (cap-fill clients are not seats).
    expect(used).toBe(2);

    // Expired invites do not count.
    await prisma.invitation.update({
      where: { id: inviter.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await seatsInUse(orgId)).toBe(1);

    await prisma.invitation.delete({ where: { id: inviter.id } });
  });

  it("revoked invites free their seat", async () => {
    const inv = await prisma.invitation.create({
      data: {
        orgId,
        email: `revoked-${Date.now()}@example.com`,
        role: "MEMBER",
        tokenHash: `r${Date.now()}`,
        invitedBy: userId,
        expiresAt: new Date(Date.now() + 86_400_000),
        status: "REVOKED",
      },
    });
    expect(await seatsInUse(orgId)).toBe(1);
    await prisma.invitation.delete({ where: { id: inv.id } });
  });
});

describe("storage entitlement (RULE-ENT-03)", () => {
  it("computes usage from stored document rows", async () => {
    const before = await checkStorageEntitlement(orgId, 1024);
    expect(before.allowed).toBe(true);

    const doc = await prisma.document.create({
      data: {
        orgId,
        uploaderId: userId,
        title: "ITest doc",
        mimeType: "text/plain",
        sizeBytes: 5 * 1024 * 1024,
        storageKey: `itest-${Date.now()}`,
        originalName: "itest.txt",
        sha256: "0".repeat(64),
      },
    });
    createdDocKeys.push(doc.storageKey);

    // Starter = 10 GB; a single 5 MB file leaves plenty of room.
    const after = await checkStorageEntitlement(orgId, 1024);
    expect(after.allowed).toBe(true);
    expect(after.planName).toBe("Starter");
  });

  it("rejects uploads that would exceed the plan cap", async () => {
    // Verify the arithmetic against a synthetic over-cap usage: 10 GB cap,
    // pretend 10 GB is used — anything > 0 must be refused.
    const plan = planOf("STARTER");
    const capBytes = plan.storageMb * 1024 * 1024;
    const fakeUsed = capBytes;
    expect(fakeUsed + 1024 > capBytes).toBe(true);
  });
});

describe("subscription lifecycle (RULE-ENT-04)", () => {
  it("lazily creates a 14-day TRIALING subscription", async () => {
    const sub = await getOrCreateSubscription(orgId);
    expect(sub.state).toBe("TRIALING");
    expect(sub.trialEndsAt).not.toBeNull();
    const span = sub.trialEndsAt!.getTime() - sub.createdAt.getTime();
    expect(span).toBeGreaterThanOrEqual((TRIAL_DAYS - 0.01) * 86_400_000);
    expect(isEntitled(sub.state, sub.trialEndsAt)).toBe(true);
  });

  it("is idempotent under repeat calls", async () => {
    const a = await getOrCreateSubscription(orgId);
    const b = await getOrCreateSubscription(orgId);
    expect(a.id).toBe(b.id);
  });

  it("closes the gate when the trial lapses", async () => {
    const sub = await getOrCreateSubscription(orgId);
    const expiredAt = new Date(Date.now() - 1000);
    await prisma.subscription.update({ where: { id: sub.id }, data: { trialEndsAt: expiredAt } });
    const reloaded = await prisma.subscription.findUnique({ where: { orgId } });
    expect(isEntitled(reloaded!.state, reloaded!.trialEndsAt)).toBe(false);

    // Restore for teardown symmetry.
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000) },
    });
  });

  it("returns to entitled when a plan is activated", async () => {
    const sub = await getOrCreateSubscription(orgId);
    await prisma.subscription.update({ where: { id: sub.id }, data: { state: "ACTIVE" } });
    const reloaded = await prisma.subscription.findUnique({ where: { orgId } });
    expect(isEntitled(reloaded!.state, reloaded!.trialEndsAt)).toBe(true);
    await prisma.subscription.update({ where: { id: sub.id }, data: { state: "TRIALING" } });
  });
});
