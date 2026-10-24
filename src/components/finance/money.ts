import { gstBreakdown, isGstRateBps } from "@/lib/gst";

/** Pure money / GST helpers shared by server pages, actions and client forms. */

export interface LineInput {
  description: string;
  quantity: number;
  unit?: string;
  rateMinor: number;
  gstBps: number;
}

export interface InvoiceTotals {
  netMinor: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  taxMinor: number;
  grossMinor: number;
  interstate: boolean;
}

export function lineNet(l: Pick<LineInput, "quantity" | "rateMinor">): number {
  const n = Math.round((Number(l.quantity) || 0) * (Number(l.rateMinor) || 0));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Totals from lines. Tax is computed per line with lib/gst (half-up, exact split). */
export function invoiceTotals(lines: Array<Pick<LineInput, "quantity" | "rateMinor" | "gstBps">>, interstate: boolean): InvoiceTotals {
  let netMinor = 0;
  let cgstMinor = 0;
  let sgstMinor = 0;
  let igstMinor = 0;
  for (const l of lines) {
    const net = lineNet(l);
    const rate = isGstRateBps(l.gstBps) ? l.gstBps : 0;
    // gstBreakdown decides CGST+SGST vs IGST from state equality; use sentinel states.
    const b = gstBreakdown(net, rate, "seller", interstate ? "buyer" : "seller");
    netMinor += net;
    cgstMinor += b.cgstMinor ?? 0;
    sgstMinor += b.sgstMinor ?? 0;
    igstMinor += b.igstMinor ?? 0;
  }
  const taxMinor = cgstMinor + sgstMinor + igstMinor;
  return { netMinor, cgstMinor, sgstMinor, igstMinor, taxMinor, grossMinor: netMinor + taxMinor, interstate };
}

interface InvoiceLike {
  amountMinor: number;
  gstRateBps: number;
  interstate: boolean;
  placeOfSupply: string | null;
  lines: Array<{ quantity: number; rateMinor: number; gstBps: number }>;
}

export function isInterstate(inv: Pick<InvoiceLike, "interstate" | "placeOfSupply">, orgState: string | null | undefined): boolean {
  if (inv.interstate) return true;
  if (orgState && inv.placeOfSupply) return orgState.trim().toLowerCase() !== inv.placeOfSupply.trim().toLowerCase();
  return false;
}

/** Totals for a stored invoice (lines when present, legacy single-rate otherwise). */
export function totalsForInvoice(inv: InvoiceLike, orgState: string | null | undefined): InvoiceTotals {
  const interstate = isInterstate(inv, orgState);
  if (inv.lines.length > 0) return invoiceTotals(inv.lines, interstate);
  const rate = isGstRateBps(inv.gstRateBps) ? inv.gstRateBps : 0;
  const b = gstBreakdown(Math.max(0, inv.amountMinor), rate, "seller", interstate ? "buyer" : "seller");
  return {
    netMinor: inv.amountMinor,
    cgstMinor: b.cgstMinor ?? 0,
    sgstMinor: b.sgstMinor ?? 0,
    igstMinor: b.igstMinor ?? 0,
    taxMinor: b.taxMinor,
    grossMinor: b.grossMinor,
    interstate,
  };
}

/** SENT invoices past their due date read as OVERDUE even before the sweep flips them. */
export function effectiveInvoiceStatus(status: string, dueAt: Date | null | undefined, now = new Date()): string {
  if (status === "SENT" && dueAt) {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (dueAt.getTime() < startOfToday.getTime()) return "OVERDUE";
  }
  return status;
}

/* ── Proposal line items ─────────────────────────────────────────────── */

export interface ProposalItem {
  description: string;
  quantity: number;
  rateMinor: number;
}

/** Tolerant parse: accepts rateMinor, rate (rupees) or amount (rupees, qty 1). */
export function parseProposalItems(json: string | null | undefined): ProposalItem[] {
  try {
    const raw: unknown = JSON.parse(json || "[]");
    if (!Array.isArray(raw)) return [];
    const out: ProposalItem[] = [];
    for (const r of raw) {
      if (!r || typeof r !== "object") continue;
      const o = r as Record<string, unknown>;
      const description = String(o.description ?? o.title ?? o.name ?? "").trim();
      const quantity = Number(o.quantity ?? o.qty ?? 1);
      let rateMinor = Number(o.rateMinor ?? NaN);
      if (!Number.isFinite(rateMinor)) {
        const rupees = Number(o.rate ?? o.amount ?? o.price ?? 0);
        rateMinor = Math.round((Number.isFinite(rupees) ? rupees : 0) * 100);
      }
      out.push({ description, quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1, rateMinor: Math.max(0, Math.round(rateMinor)) });
    }
    return out;
  } catch {
    return [];
  }
}

export function proposalItemsTotal(items: Array<Pick<ProposalItem, "quantity" | "rateMinor">>): number {
  return items.reduce((s, i) => s + lineNet(i), 0);
}

/* ── Dates ───────────────────────────────────────────────────────────── */

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function monthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, (m || 1) - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}
/** Parse YYYY-MM → [start, nextMonthStart) or null. */
export function monthRange(key: string): [Date, Date] | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return [new Date(y, mo - 1, 1), new Date(y, mo, 1)];
}
