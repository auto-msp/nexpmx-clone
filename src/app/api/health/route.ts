import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Liveness + DB readiness probe for uptime monitors and the Oracle systemd unit. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", db: true });
  } catch {
    return NextResponse.json({ status: "degraded", db: false }, { status: 503 });
  }
}
