import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, fail, HttpError, parseBody, rateLimit } from "@/lib/api";
import { hashToken } from "@/lib/tenancy";
import { newPortalToken } from "@/lib/tenancy";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** API-key auth: `Authorization: Bearer bm_…` → org scope. Never trust the client. */
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

    const clients = await prisma.client.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        name: true,
        company: true,
        email: true,
        status: true,
        createdAt: true,
      },
    });
    return ok({ data: clients });
  } catch (e) {
    return fail(e);
  }
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  company: z.string().trim().max(120).optional(),
  email: z.string().trim().email().max(200).optional(),
});

export async function POST(req: Request) {
  try {
    const orgId = await orgFromApiKey(req);
    rateLimit(`api:${orgId}`, 60, 60_000);

    const body = await parseBody(req, createSchema);
    const client = await prisma.client.create({
      data: {
        orgId,
        name: body.name,
        company: body.company ?? null,
        email: body.email ?? null,
        portalToken: newPortalToken(),
      },
      select: { id: true, name: true, createdAt: true },
    });

    await audit({
      orgId,
      action: "client.created",
      entity: "Client",
      entityId: client.id,
      meta: { via: "api" },
    });

    return ok({ data: client }, 201);
  } catch (e) {
    return fail(e);
  }
}
