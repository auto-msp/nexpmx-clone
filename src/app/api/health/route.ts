import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Liveness + DB readiness probe for uptime monitors and the Oracle systemd unit.
 *
 * `SELECT 1` alone is NOT sufficient: it succeeds against an empty database, so
 * it reported "ok" while the app had zero tables and every real page 500'd
 * (schema applied via db push, never via migrations). The probe below requires
 * the core schema to actually exist — a migration-less or half-applied database
 * now fails the gate instead of passing it silently.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    // Cheap existence check on one core table of each tenant-owned cluster.
    await prisma.$queryRaw`SELECT 1 FROM "Organization" LIMIT 1`;
    await prisma.$queryRaw`SELECT 1 FROM "User" LIMIT 1`;
    return NextResponse.json({ status: "ok", db: true });
  } catch {
    return NextResponse.json({ status: "degraded", db: false }, { status: 503 });
  }
}
