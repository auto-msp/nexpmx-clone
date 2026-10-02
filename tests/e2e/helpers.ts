/**
 * E2E fixtures: seed auth sessions + orgs directly via Prisma.
 *
 * The app has exactly one login provider (Google OAuth) and database
 * sessions (Auth.js v5 PrismaAdapter: Session rows keyed by sessionToken,
 * read via the `authjs.session-token` cookie). Instead of automating Google,
 * tests create real Session rows and inject the cookie — the server-side
 * session lookup is identical to a real login.
 *
 * Fixtures are org-scoped with unique suffixes and torn down via the
 * returned cleanup functions, so the suite is safe to run repeatedly
 * against the shared dev Postgres (same convention as tests/integration.test.ts).
 */
import { PrismaClient } from "@prisma/client";
import { createHmac, randomBytes } from "node:crypto";
import type { Page } from "@playwright/test";

// .env loading mirrors playwright.config.ts (real env wins).
const raw = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("node:fs").readFileSync(".env", "utf8") as string;
  } catch {
    return "";
  }
})();
for (const line of raw.split("\n")) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  const value = m[2].replace(/^["']|["']$/g, "");
  if (!(m[1] in process.env)) process.env[m[1]] = value;
}
process.env.RAZORPAY_WEBHOOK_SECRET ??= "e2e-whsec";

export const prisma = new PrismaClient();
const suffix = randomBytes(4).toString("hex");

export interface TestOrg {
  userId: string;
  orgId: string;
  sessionToken: string;
  email: string;
}

/** Create a user + org + membership + TRIALING subscription + DB session. */
export async function seedPersona(
  name: string,
  opts: { plan?: "STARTER" | "GROWTH" | "SCALE"; state?: "TRIALING" | "ACTIVE"; daysToTrialEnd?: number } = {},
): Promise<TestOrg> {
  const email = `e2e-${name}-${suffix}@example.com`;
  const user = await prisma.user.create({
    data: { email, name: `E2E ${name}` },
  });
  const org = await prisma.organization.create({
    data: {
      name: `E2E ${name} Org`,
      slug: `e2e-${name}-${suffix}`,
      plan: opts.plan ?? "STARTER",
    },
  });
  await prisma.membership.create({
    data: { userId: user.id, orgId: org.id, role: "OWNER" },
  });
  if (opts.state) {
    await prisma.subscription.create({
      data: {
        orgId: org.id,
        state: opts.state,
        plan: opts.plan ?? "STARTER",
        ...(opts.state === "TRIALING"
          ? { trialEndsAt: new Date(Date.now() + (opts.daysToTrialEnd ?? 10) * 86_400_000) }
          : {
              currentPeriodStart: new Date(Date.now() - 86_400_000),
              currentPeriodEnd: new Date(Date.now() + 29 * 86_400_000),
              seats: 5,
            }),
      },
    });
  }
  // Auth.js v5 PrismaAdapter session row: the sessionToken IS the cookie value.
  const sessionToken = randomBytes(32).toString("hex");
  await prisma.session.create({
    data: {
      sessionToken,
      userId: user.id,
      expires: new Date(Date.now() + 30 * 86_400_000),
    },
  });
  return { userId: user.id, orgId: org.id, sessionToken, email };
}

/** Inject the DB session cookie into the browser context. */
export async function loginAs(page: Page, persona: TestOrg): Promise<void> {
  await page.context().addCookies([
    {
      name: "authjs.session-token",
      value: persona.sessionToken,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

/**
 * Create a user whose ONLY membership is MEMBER in the given org (no personal
 * org). getOrgContext picks the oldest membership, so testing the MEMBER path
 * requires the user to have no earlier OWNER membership.
 */
export async function seedMemberOf(orgId: string, name: string): Promise<TestOrg> {
  const email = `e2e-${name}-${suffix}@example.com`;
  const user = await prisma.user.create({
    data: { email, name: `E2E ${name}` },
  });
  await prisma.membership.create({
    data: { userId: user.id, orgId, role: "MEMBER" },
  });
  const sessionToken = randomBytes(32).toString("hex");
  await prisma.session.create({
    data: {
      sessionToken,
      userId: user.id,
      expires: new Date(Date.now() + 30 * 86_400_000),
    },
  });
  return { userId: user.id, orgId, sessionToken, email };
}

/** Create a client row for an org and return its id. */
export async function seedClient(orgId: string, name: string): Promise<string> {
  const client = await prisma.client.create({
    data: { orgId, name, portalToken: `e2e-portal-${randomBytes(8).toString("hex")}` },
  });
  return client.id;
}

/** Build the Razorpay-signed webhook headers for a raw body. */
export function signedWebhookHeaders(body: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Razorpay-Signature": createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!)
      .update(body)
      .digest("hex"),
  };
}

/** Delete every row tied to a persona, in FK-safe order. */
export async function teardownPersona(persona: TestOrg): Promise<void> {
  await prisma.billingEvent.deleteMany({ where: { orgId: persona.orgId } });
  await prisma.auditLog.deleteMany({ where: { orgId: persona.orgId } });
  await prisma.checkoutSession.deleteMany({ where: { orgId: persona.orgId } });
  await prisma.subscription.deleteMany({ where: { orgId: persona.orgId } });
  await prisma.idempotencyKey.deleteMany({ where: { orgId: persona.orgId } });
  await prisma.invoice.deleteMany({ where: { orgId: persona.orgId } });
  await prisma.client.deleteMany({ where: { orgId: persona.orgId } });
  await prisma.organization.deleteMany({ where: { id: persona.orgId } });
  await prisma.session.deleteMany({ where: { userId: persona.userId } });
  await prisma.user.deleteMany({ where: { id: persona.userId } });
}

export { suffix };
