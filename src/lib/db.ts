import { PrismaClient } from "@prisma/client";

/**
 * Single Prisma instance across dev hot-reloads.
 * In production the process is long-lived so this creates exactly one pool.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
