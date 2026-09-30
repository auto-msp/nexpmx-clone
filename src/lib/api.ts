import { NextResponse } from "next/server";
import { ZodSchema } from "zod";
import { auth } from "@/lib/auth";
import { requireOrgContext, OrgContext } from "@/lib/tenancy";

/**
 * Shared helpers for API route handlers: JSON envelope, auth guard,
 * schema validation, and consistent error mapping. Every route handler in
 * /api uses these so error shapes and status codes stay uniform (API.md).
 */

export class HttpError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409 | 402 | 422 | 429 | 500,
    message: string,
  ) {
    super(message);
  }
}

type Json = Record<string, unknown>;

export function ok<T extends Json>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function fail(error: unknown) {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const err = error as Error & { status?: number };
  if (err?.status) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error("[api] unhandled", error);
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}

/** Session + org guard for route handlers. Throws HttpError(401) if absent. */
export async function requireApiContext(): Promise<
  OrgContext & { email: string | null }
> {
  const session = await auth();
  if (!session?.user?.id) throw new HttpError(401, "Authentication required");
  const ctx = await requireOrgContext(session.user.id);
  return { ...ctx, email: session.user.email ?? null };
}

/** Parse + validate a JSON body against a zod schema. */
export async function parseBody<T>(req: Request, schema: ZodSchema<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new HttpError(422, parsed.error.issues.map((i) => i.message).join("; "));
  }
  return parsed.data;
}

/** Simple in-memory fixed-window limiter. Single-instance only; see SECURITY.md. */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  b.count += 1;
  if (b.count > limit) {
    throw new HttpError(429, "Too many requests — slow down and retry shortly");
  }
}
