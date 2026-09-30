import { prisma } from "@/lib/db";
import { ok, fail, HttpError, rateLimit } from "@/lib/api";
import { hashToken } from "@/lib/tenancy";

export const dynamic = "force-dynamic";

async function orgFromApiKey(req: Request): Promise<string> {
  const header = req.headers.get("authorization") ?? "";
  const raw = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!raw.startsWith("bm_") || raw.length < 16) {
    throw new HttpError(401, "Missing or malformed API key");
  }
  const key = await prisma.apiKey.findUnique({
    where: { keyHash: hashToken(raw) },
    select: { orgId: true, revokedAt: true },
  });
  if (!key || key.revokedAt) throw new HttpError(401, "Invalid API key");
  return key.orgId;
}

export async function GET(req: Request) {
  try {
    const orgId = await orgFromApiKey(req);
    rateLimit(`api:${orgId}`, 60, 60_000);

    const invoices = await prisma.invoice.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        number: true,
        amountMinor: true,
        currency: true,
        status: true,
        dueAt: true,
        client: { select: { name: true } },
      },
    });
    return ok({ data: invoices });
  } catch (e) {
    return fail(e);
  }
}
