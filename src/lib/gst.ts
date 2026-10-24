/**
 * GST math (India) + UPI payment-link builder.
 *
 * Business rules (BUSINESS_RULES.md RULE-GST-01):
 * - Invoice amounts are stored NET of tax, in minor units (paise).
 * - gstRateBps is basis points of NET: 0 / 500 / 1200 / 1800 / 2800.
 * - Intra-state supply (seller state == place of supply): CGST + SGST, each
 *   half the rate. Inter-state: IGST at the full rate. Seller state comes
 *   from the org profile; place of supply is chosen per invoice.
 * - Tax amounts are ROUNDED-HALF-UP to the nearest paisa, computed
 *   independently per component so the printed split always sums exactly
 *   to the total tax. Gross = net + total tax. Pure functions — unit-tested.
 * - UPI intent links follow the standard `upi://pay` parameter scheme
 *   (pa/payee VPA, pn/name, am/amount, cu/currency, tn/note). The amount is
 *   the GROSS figure. Links are informational intents — actual collection
 *   still happens through the processor (Razorpay) when configured.
 */

export const GST_RATES_BPS = [0, 500, 1200, 1800, 2800] as const;

export function isGstRateBps(v: number): v is (typeof GST_RATES_BPS)[number] {
  return (GST_RATES_BPS as readonly number[]).includes(v);
}

export interface GstBreakdown {
  netMinor: number;
  rateBps: number;
  /** Total tax (CGST+SGST or IGST), paise, rounded half-up. */
  taxMinor: number;
  cgstMinor: number | null;
  sgstMinor: number | null;
  igstMinor: number | null;
  grossMinor: number;
  intraState: boolean;
}

/** Round half-up to the nearest integer (paisa). */
function roundHalfUp(x: number): number {
  return Math.floor(x + 0.5);
}

export function gstBreakdown(
  netMinor: number,
  rateBps: number,
  sellerState: string | null | undefined,
  placeOfSupply: string | null | undefined,
): GstBreakdown {
  if (!Number.isSafeInteger(netMinor) || netMinor < 0) {
    throw new Error("Net amount must be a non-negative integer (paise)");
  }
  if (!isGstRateBps(rateBps)) {
    throw new Error("Invalid GST rate");
  }
  const tax = roundHalfUp((netMinor * rateBps) / 10_000);
  const intraState =
    Boolean(sellerState) &&
    Boolean(placeOfSupply) &&
    sellerState!.trim().toLowerCase() === placeOfSupply!.trim().toLowerCase();

  if (rateBps === 0) {
    return {
      netMinor,
      rateBps,
      taxMinor: 0,
      cgstMinor: null,
      sgstMinor: null,
      igstMinor: null,
      grossMinor: netMinor,
      intraState,
    };
  }

  if (intraState) {
    // Independent half-up rounding per component; sum is the total tax.
    const half = roundHalfUp((netMinor * rateBps) / 20_000);
    return {
      netMinor,
      rateBps,
      taxMinor: half * 2,
      cgstMinor: half,
      sgstMinor: half,
      igstMinor: null,
      grossMinor: netMinor + half * 2,
      intraState,
    };
  }

  return {
    netMinor,
    rateBps,
    taxMinor: tax,
    cgstMinor: null,
    sgstMinor: null,
    igstMinor: tax,
    grossMinor: netMinor + tax,
    intraState,
  };
}

/** "₹1,234.56" style formatting for invoice display. */
export function formatPaise(minor: number): string {
  return `₹${(minor / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** bps → human label ("18%"). */
export function gstRateLabel(rateBps: number): string {
  return `${(rateBps / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}%`;
}

// ── UPI payment intent ───────────────────────────────────────────────────────

export interface UpiLinkInput {
  vpa: string;
  payeeName: string;
  /** Amount in paise (gross = net + tax). */
  amountMinor: number;
  note: string;
}

/**
 * Build a standard UPI deep link. Returns null when the VPA is malformed
 * (must be name@bank, ≤ 100 chars). Pure — unit-tested.
 */
export function upiPaymentLink(input: UpiLinkInput): string | null {
  const vpa = input.vpa.trim();
  if (!/^[a-zA-Z0-9.\-_]{2,64}@[a-zA-Z][a-zA-Z0-9.\-]{1,32}$/.test(vpa)) {
    return null;
  }
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    return null;
  }
  const params = new URLSearchParams({
    pa: vpa,
    pn: input.payeeName.slice(0, 50),
    am: (input.amountMinor / 100).toFixed(2),
    cu: "INR",
    tn: input.note.slice(0, 50),
  });
  return `upi://pay?${params.toString()}`;
}
