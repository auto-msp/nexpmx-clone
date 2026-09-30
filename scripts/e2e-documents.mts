/**
 * E2E verification for the Document Hub download path.
 *
 * Runs against a live server (npm run start) and the dev database:
 *   1. creates a real user/org/session (Auth.js database sessions),
 *   2. mints a signed download token for a document inserted via Prisma,
 *   3. asserts the full HTTP behavior of GET /api/download/[documentId]:
 *      200 + exact bytes for a valid token, 403 for wrong-org / tampered /
 *      portal-audience tokens, 404 for a missing file on disk, 401 no session,
 *   4. cleans up all rows.
 *
 * Usage: npx tsx scripts/e2e-documents.mts   (server must be running)
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { signDownloadToken } from "../src/lib/documents";

// Mirror prisma.config.ts: real env wins over .env.
try {
  const raw = await import("node:fs").then((fs) => fs.readFileSync(".env", "utf8"));
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    const value = m[2].replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
} catch {}

process.env.DOCUMENT_STORAGE_DIR =
  process.env.DOCUMENT_STORAGE_DIR ?? "/var/lib/bizmemory/documents";

const prisma = new PrismaClient();
const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    failures++;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const stamp = Date.now();
const suffix = randomBytes(3).toString("hex");

// ── 1. Fixtures ──────────────────────────────────────────────────────────────
const user = await prisma.user.create({
  data: { email: `e2e-${stamp}-${suffix}@example.com`, name: "E2E Tester" },
});
const org = await prisma.organization.create({
  data: { name: "E2E Org", slug: `e2e-${suffix}`, plan: "STARTER" },
});
await prisma.membership.create({ data: { userId: user.id, orgId: org.id, role: "OWNER" } });
await prisma.subscription.create({
  data: {
    orgId: org.id,
    state: "TRIALING",
    plan: "STARTER",
    trialEndsAt: new Date(Date.now() + 14 * 86_400_000),
  },
});
const otherOrg = await prisma.organization.create({
  data: { name: "E2E Other", slug: `e2e-o-${suffix}`, plan: "STARTER" },
});
const otherUser = await prisma.user.create({
  data: { email: `e2e-other-${stamp}-${suffix}@example.com`, name: "E2E Other" },
});
await prisma.membership.create({
  data: { userId: otherUser.id, orgId: otherOrg.id, role: "OWNER" },
});
const otherSessionToken = randomBytes(32).toString("hex");
await prisma.session.create({
  data: { sessionToken: otherSessionToken, userId: otherUser.id, expires: new Date(Date.now() + 86_400_000) },
});

// Session for the primary user (Auth.js database strategy row).
const sessionToken = randomBytes(32).toString("hex");
await prisma.session.create({
  data: { sessionToken, userId: user.id, expires: new Date(Date.now() + 86_400_000) },
});

// ── 2. A document with real bytes on disk ───────────────────────────────────
const doc = await prisma.document.create({
  data: {
    orgId: org.id,
    uploaderId: user.id,
    title: "E2E Contract",
    mimeType: "application/pdf",
    sizeBytes: 0,
    storageKey: "pending",
    originalName: "contract-v1.pdf",
    sha256: "0".repeat(64),
  },
});
const contents = Buffer.from("E2E contract contents — confidential.", "utf8");
const key = `${org.id}/${suffix.slice(0, 2)}/${suffix.slice(2, 4)}/${randomBytes(16).toString("hex")}`;
const abs = path.join(process.env.DOCUMENT_STORAGE_DIR!, key);
mkdirSync(path.dirname(abs), { recursive: true });
writeFileSync(abs, contents, { mode: 0o640 });
await prisma.document.update({
  where: { id: doc.id },
  data: { storageKey: key, sizeBytes: contents.byteLength },
});

const dlBase = `${BASE}/api/download/${doc.id}`;

// ── 3. Assertions ────────────────────────────────────────────────────────────
console.log("Document Hub download e2e:");

// No session, no token.
{
  const res = await fetch(dlBase);
  check("unauthenticated request → 403 (no token)", res.status === 403, String(res.status));
}

// Session but no token.
{
  const res = await fetch(dlBase, {
    headers: { cookie: `authjs.session-token=${sessionToken}` },
  });
  check("valid session, missing token → 403", res.status === 403, String(res.status));
}

// Valid token, valid session → exact bytes.
{
  const t = signDownloadToken({
    documentId: doc.id,
    orgId: org.id,
    expiresAt: Date.now() + 60_000,
  });
  const res = await fetch(`${dlBase}?t=${encodeURIComponent(t)}`, {
    headers: { cookie: `authjs.session-token=${sessionToken}` },
  });
  const body = Buffer.from(await res.arrayBuffer());
  check("valid token + session → 200", res.status === 200, String(res.status));
  check("bytes round-trip exactly", body.equals(contents));
  check(
    "content-type preserved",
    res.headers.get("content-type") === "application/pdf",
    res.headers.get("content-type") ?? "none",
  );
  check(
    "attachment disposition",
    (res.headers.get("content-disposition") ?? "").includes("attachment"),
  );
  check(
    "no-store on private files",
    (res.headers.get("cache-control") ?? "").includes("no-store"),
  );
}

// Cross-org: valid signature but other org's session → 403.
{
  const t = signDownloadToken({
    documentId: doc.id,
    orgId: org.id,
    expiresAt: Date.now() + 60_000,
  });
  const res = await fetch(`${dlBase}?t=${encodeURIComponent(t)}`, {
    headers: { cookie: `authjs.session-token=${otherSessionToken}` },
  });
  check("cross-org session → 403 (IDOR)", res.status === 403, String(res.status));
}

// Tampered payload.
{
  const t = signDownloadToken({
    documentId: doc.id,
    orgId: org.id,
    expiresAt: Date.now() + 60_000,
  });
  const [payload, sig] = t.split(".");
  const forged = Buffer.from(
    JSON.stringify({ documentId: doc.id, orgId: otherOrg.id, expiresAt: Date.now() + 60_000 }),
  ).toString("base64url");
  const res = await fetch(`${dlBase}?t=${encodeURIComponent(forged)}.${sig}`, {
    headers: { cookie: `authjs.session-token=${sessionToken}` },
  });
  check("tampered token → 403", res.status === 403, String(res.status));
  void payload;
}

// Expired token.
{
  const t = signDownloadToken({
    documentId: doc.id,
    orgId: org.id,
    expiresAt: Date.now() - 1000,
  });
  const res = await fetch(`${dlBase}?t=${encodeURIComponent(t)}`, {
    headers: { cookie: `authjs.session-token=${sessionToken}` },
  });
  check("expired token → 403", res.status === 403, String(res.status));
}

// Portal-audience token must not open the app route.
{
  const t = signDownloadToken({
    documentId: doc.id,
    orgId: org.id,
    expiresAt: Date.now() + 60_000,
    portalToken: "a".repeat(32),
  });
  const res = await fetch(`${dlBase}?t=${encodeURIComponent(t)}`, {
    headers: { cookie: `authjs.session-token=${sessionToken}` },
  });
  check("portal-scoped token rejected on app route → 403", res.status === 403, String(res.status));
}

// Valid token but file missing on disk → 404.
{
  await prisma.document.update({ where: { id: doc.id }, data: { storageKey: `${org.id}/00/00/${"0".repeat(32)}` } });
  const t = signDownloadToken({
    documentId: doc.id,
    orgId: org.id,
    expiresAt: Date.now() + 60_000,
  });
  const res = await fetch(`${dlBase}?t=${encodeURIComponent(t)}`, {
    headers: { cookie: `authjs.session-token=${sessionToken}` },
  });
  check("file missing from storage → 404", res.status === 404, String(res.status));
  await prisma.document.update({ where: { id: doc.id }, data: { storageKey: key } });
}

// Non-existent document id (validly signed for that id) → 404, no leak.
{
  const ghost = `${"g".repeat(24)}${stamp}`;
  const t = signDownloadToken({
    documentId: ghost,
    orgId: org.id,
    expiresAt: Date.now() + 60_000,
  });
  const res = await fetch(`${BASE}/api/download/${ghost}?t=${encodeURIComponent(t)}`, {
    headers: { cookie: `authjs.session-token=${sessionToken}` },
  });
  check("non-existent document → 404", res.status === 404, String(res.status));
}

// Audit trail recorded the successful download.
{
  const events = await prisma.auditLog.count({
    where: { orgId: org.id, action: "document.downloaded", entityId: doc.id },
  });
  check("document.downloaded audit events written", events >= 1, String(events));
}

// ── 4. Cleanup ───────────────────────────────────────────────────────────────
rmSync(path.dirname(abs), { recursive: true, force: true });
await prisma.document.deleteMany({ where: { orgId: org.id } });
await prisma.auditLog.deleteMany({ where: { orgId: { in: [org.id, otherOrg.id] } } });
await prisma.subscription.deleteMany({ where: { orgId: org.id } });
await prisma.organization.deleteMany({ where: { id: { in: [org.id, otherOrg.id] } } });
await prisma.user.deleteMany({ where: { id: { in: [user.id, otherUser.id] } } });
await prisma.$disconnect();

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nAll document download e2e checks passed.");
