import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/api";
import { storage } from "@/lib/storage";
import { isAllowedMime, verifyDownloadToken } from "@/lib/documents";

export const dynamic = "force-dynamic";

/**
 * Portal download — capability-token authenticated, read-only.
 * The signed download token (page → URL, 5-min TTL) is additionally bound
 * to the portal token presented in the URL, and the document must belong to
 * the portal's own client. Anything else is 403 before storage is touched.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ documentId: string; token: string }> },
) {
  const { documentId, token } = await params;

  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    rateLimit(`portal-dl:${ip}`, 30, 60_000);

    const url = new URL(req.url);
    const claims = verifyDownloadToken(url.searchParams.get("t"));
    if (
      !claims ||
      claims.documentId !== documentId ||
      claims.portalToken !== token
    ) {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 403 });
    }

    // Portal capability check — same rule as the portal page itself.
    if (!/^[a-f0-9]{32}$/.test(token)) {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 403 });
    }
    const client = await prisma.client.findUnique({
      where: { portalToken: token },
      select: { id: true, orgId: true },
    });
    if (!client || client.orgId !== claims.orgId) {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 403 });
    }

    const doc = await prisma.document.findFirst({
      where: {
        id: documentId,
        orgId: client.orgId,
        clientId: client.id, // scoped to the portal's own client — IDOR backstop
      },
      select: { mimeType: true, storageKey: true, originalName: true, title: true },
    });
    if (!doc) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!isAllowedMime(doc.mimeType)) {
      return NextResponse.json({ error: "File type not permitted" }, { status: 403 });
    }

    const fileStat = await storage.stat(doc.storageKey);
    if (!fileStat) {
      return NextResponse.json({ error: "File missing from storage" }, { status: 404 });
    }

    let stream: ReadableStream<Uint8Array>;
    try {
      stream = await storage.getStream(doc.storageKey);
    } catch {
      return NextResponse.json({ error: "File missing from storage" }, { status: 404 });
    }

    const filename = doc.originalName || doc.title;
    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": doc.mimeType,
        "Content-Length": String(fileStat.sizeBytes),
        "Content-Disposition": `attachment; filename="${filename.replace(/["\\\r\n]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    console.error("[portal-download] failed", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
