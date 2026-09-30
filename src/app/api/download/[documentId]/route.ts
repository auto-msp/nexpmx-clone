import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getOrgContext } from "@/lib/tenancy";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/api";
import { storage } from "@/lib/storage";
import { isAllowedMime, verifyDownloadToken } from "@/lib/documents";
import { isEntitled } from "@/lib/subscription";

export const dynamic = "force-dynamic";

// Signed links live 5 minutes (see signDownloadToken in lib/documents).

/**
 * Authenticated download: the page renders links whose token already binds
 * documentId + org + a 5-minute expiry (HMAC-SHA256, AUTH_SECRET). The
 * handler re-checks signature/expiry, then the session, then org scope —
 * three independent gates before a byte is read. Direct document-id access
 * without a valid token is 403.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await params;

  try {
    const url = new URL(req.url);
    const claims = verifyDownloadToken(url.searchParams.get("t"));
    if (!claims || claims.documentId !== documentId) {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 403 });
    }
    // Audience separation: portal-scoped tokens never validate here.
    if (claims.portalToken) {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 403 });
    }

    // Session + org membership (the tenancy gate).
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const ctx = await getOrgContext(session.user.id);
    if (!ctx) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    // Claims are signed by us, but the org scope must still match the caller.
    if (ctx.orgId !== claims.orgId) {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 403 });
    }

    // Subscription gate: downloads stay open during TRIALING; expired trials
    // and canceled orgs are blocked (BUSINESS_RULES RULE-ENT-04).
    const sub = await prisma.subscription.findUnique({ where: { orgId: ctx.orgId } });
    if (sub && !isEntitled(sub.state, sub.trialEndsAt)) {
      return NextResponse.json({ error: "Subscription inactive" }, { status: 402 });
    }

    rateLimit(`dl:${ctx.userId}`, 60, 60_000);

    // Org-scoped fetch — the IDOR backstop even if a token leaked.
    const doc = await prisma.document.findFirst({
      where: { id: documentId, orgId: ctx.orgId },
      select: { title: true, mimeType: true, storageKey: true, sizeBytes: true, originalName: true },
    });
    if (!doc) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!isAllowedMime(doc.mimeType)) {
      return NextResponse.json({ error: "File type not permitted" }, { status: 403 });
    }

    let bytes: Buffer;
    try {
      bytes = await storage.get(doc.storageKey);
    } catch {
      return NextResponse.json({ error: "File missing from storage" }, { status: 404 });
    }

    await audit({
      orgId: ctx.orgId,
      actorId: ctx.userId,
      action: "document.downloaded",
      entity: "Document",
      entityId: documentId,
      meta: { sizeBytes: bytes.byteLength, via: "app" },
    });

    const filename = doc.originalName || doc.title;
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": doc.mimeType,
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `attachment; filename="${filename.replace(/["\\\r\n]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    console.error("[download] failed", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
