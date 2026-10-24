import type { Prisma } from "@prisma/client";

/**
 * Next invoice number for an org: INV-YYYY-0001, per-org sequence per year.
 * Call INSIDE the create transaction (Serializable via withIdempotency) so two
 * concurrent creates cannot take the same number.
 */
export async function nextInvoiceNumber(tx: Prisma.TransactionClient, orgId: string, year = new Date().getFullYear()): Promise<string> {
  const prefix = `INV-${year}-`;
  const rows = await tx.invoice.findMany({ where: { orgId, number: { startsWith: prefix } }, select: { number: true } });
  let max = 0;
  for (const r of rows) {
    const n = parseInt(r.number.slice(prefix.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}
