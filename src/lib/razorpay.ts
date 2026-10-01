/**
 * Razorpay client (Orders API) and webhook signature verification — ADR-017.
 *
 * Kept dependency-free on purpose: the Orders API surface we use is two
 * endpoints, and fetch + node:crypto cover it. A provider SDK would add
 * install weight without changing the security model.
 *
 * Secrets: RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET / RAZORPAY_WEBHOOK_SECRET
 * are read lazily and never logged or echoed. The checkout page only ever
 * receives the public key id — the secret stays server-side.
 *
 * Money: amounts are integer minor units (paise) everywhere (ADR-009).
 */

const RZP_API = "https://api.razorpay.com/v1";
import { createHmac, timingSafeEqual } from "node:crypto";

export class BillingConfigError extends Error {
  constructor(missing: string) {
    super(`Billing is not configured: missing ${missing}`);
  }
}

/** Whether the billing rail is configured at all (drives UI copy). */
export function isBillingConfigured(): boolean {
  return Boolean(
    process.env.RAZORPAY_KEY_ID &&
      process.env.RAZORPAY_KEY_SECRET &&
      process.env.RAZORPAY_WEBHOOK_SECRET,
  );
}

function requireSecret(name: string): string {
  const value = process.env[name];
  if (!value) throw new BillingConfigError(name);
  return value;
}

function basicAuth(): string {
  const id = requireSecret("RAZORPAY_KEY_ID");
  const secret = requireSecret("RAZORPAY_KEY_SECRET");
  return `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
}

export interface RazorpayOrder {
  id: string;
  amount: number; // minor units
  currency: string;
  receipt?: string;
  status: string;
}

export async function createRazorpayOrder(input: {
  amountMinor: number;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder> {
  let res: Response;
  try {
    res = await fetch(`${RZP_API}/orders`, {
      method: "POST",
      headers: {
        Authorization: basicAuth(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: input.amountMinor,
        currency: "INR",
        receipt: input.receipt,
        notes: input.notes ?? {},
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error("Payment provider unreachable — try again shortly");
  }
  if (!res.ok) {
    // Body may contain provider diagnostics; never surface or log it raw.
    throw new Error(`Payment provider rejected order creation (${res.status})`);
  }
  return (await res.json()) as RazorpayOrder;
}

/**
 * Verify a webhook signature: HMAC-SHA256 of the raw request body, keyed by
 * RAZORPAY_WEBHOOK_SECRET, compared against X-Razorpay-Signature in
 * constant time. Razorpay's documented scheme.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
): boolean {
  if (!signature) return false;
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Quote for the checkout UI: seats × per-user price, INR minor units. */
export function quoteAmountMinor(seats: number, perUserMinor: number): number {
  return seats * perUserMinor;
}
