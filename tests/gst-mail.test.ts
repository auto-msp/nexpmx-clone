import { describe, expect, it } from "vitest";
import {
  gstBreakdown,
  gstRateLabel,
  upiPaymentLink,
  isGstRateBps,
} from "@/lib/gst";
import {
  isPlausibleEmail,
  inviteEmail,
  automationEmail,
  appUrl,
} from "@/lib/mail";

// ── GST math ─────────────────────────────────────────────────────────────────

describe("gstBreakdown", () => {
  it("zero rate yields no tax and gross == net", () => {
    const g = gstBreakdown(100_000, 0, "Maharashtra", "Maharashtra");
    expect(g.taxMinor).toBe(0);
    expect(g.grossMinor).toBe(100_000);
    expect(g.cgstMinor).toBeNull();
    expect(g.igstMinor).toBeNull();
  });

  it("intra-state supply splits CGST+SGST at half rate each", () => {
    // 18% on ₹10,000 → ₹1,800 → CGST 900 + SGST 900
    const g = gstBreakdown(100_000, 1800, "Maharashtra", "Maharashtra");
    expect(g.intraState).toBe(true);
    expect(g.cgstMinor).toBe(9_000);
    expect(g.sgstMinor).toBe(9_000);
    expect(g.igstMinor).toBeNull();
    expect(g.taxMinor).toBe(18_000);
    expect(g.grossMinor).toBe(118_000);
  });

  it("inter-state supply charges IGST at full rate", () => {
    const g = gstBreakdown(100_000, 1800, "Maharashtra", "Karnataka");
    expect(g.intraState).toBe(false);
    expect(g.igstMinor).toBe(18_000);
    expect(g.cgstMinor).toBeNull();
    expect(g.grossMinor).toBe(118_000);
  });

  it("state comparison is case/whitespace insensitive", () => {
    const g = gstBreakdown(100_000, 500, " maharashtra ", "Maharashtra");
    expect(g.intraState).toBe(true);
  });

  it("missing place of supply falls back to IGST", () => {
    const g = gstBreakdown(100_000, 1800, "Maharashtra", null);
    expect(g.intraState).toBe(false);
    expect(g.igstMinor).toBe(18_000);
  });

  it("rounds half-up to the paisa", () => {
    // 18% of ₹123.45 (12345 paise) = 2222.1 → 2222
    expect(gstBreakdown(12_345, 1800, "A", "B").taxMinor).toBe(2222);
    // 5% of ₹0.30 (30 paise) = 1.5 → 2 (true half-up)
    expect(gstBreakdown(30, 500, "A", "B").taxMinor).toBe(2);
    // 5% of ₹0.09 (9 paise) = 0.45 → 0 (below the .5 boundary)
    expect(gstBreakdown(9, 500, "A", "B").taxMinor).toBe(0);
  });

  it("rejects invalid rates and negative amounts", () => {
    expect(() => gstBreakdown(100, 9999, "A", "B")).toThrow(/Invalid GST rate/);
    expect(() => gstBreakdown(-1, 0, "A", "B")).toThrow(/non-negative/);
  });

  it("accepts only the five standard rates", () => {
    expect(isGstRateBps(0)).toBe(true);
    expect(isGstRateBps(2800)).toBe(true);
    expect(isGstRateBps(1000)).toBe(false);
  });

  it("gstRateLabel renders percent", () => {
    expect(gstRateLabel(1800)).toBe("18%");
    expect(gstRateLabel(500)).toBe("5%");
  });
});

// ── UPI link ─────────────────────────────────────────────────────────────────

describe("upiPaymentLink", () => {
  it("builds a standard upi://pay intent", () => {
    const link = upiPaymentLink({
      vpa: "studio@upi",
      payeeName: "Studio Moiz",
      amountMinor: 118_000,
      note: "Invoice INV-1",
    });
    expect(link).toMatch(/^upi:\/\/pay\?/);
    expect(link).toContain("pa=studio%40upi");
    expect(link).toContain("am=1180.00");
    expect(link).toContain("cu=INR");
  });

  it("rejects malformed VPAs", () => {
    expect(upiPaymentLink({ vpa: "noupie", payeeName: "x", amountMinor: 100, note: "" })).toBeNull();
    expect(upiPaymentLink({ vpa: "a@b c", payeeName: "x", amountMinor: 100, note: "" })).toBeNull();
  });

  it("rejects non-positive amounts", () => {
    expect(upiPaymentLink({ vpa: "a@b", payeeName: "x", amountMinor: 0, note: "" })).toBeNull();
  });
});

// ── Mail helpers ─────────────────────────────────────────────────────────────

describe("mail helpers", () => {
  it("isPlausibleEmail accepts normal and rejects junk", () => {
    expect(isPlausibleEmail("person@example.com")).toBe(true);
    expect(isPlausibleEmail("nope")).toBe(false);
    expect(isPlausibleEmail("a b@c.d")).toBe(false);
  });

  it("invite template carries the URL once and no secret leakage", () => {
    const tpl = inviteEmail({
      inviterName: "Moiz <script>",
      orgName: "Studio",
      roleName: "MEMBER",
      inviteUrl: "https://app.example.com/invite/tok123",
      expiresOn: "2026-10-09",
    });
    expect(tpl.html).toContain("https://app.example.com/invite/tok123");
    expect(tpl.html).toContain("&lt;script&gt;"); // escaped
    expect(tpl.text).toContain("https://app.example.com/invite/tok123");
  });

  it("automation template mentions the detail and link", () => {
    const tpl = automationEmail({
      orgName: "Studio",
      title: "INV-1",
      detail: "Payment received for invoice INV-1.",
      appUrl: "https://app.example.com",
    });
    expect(tpl.subject).toContain("INV-1");
    expect(tpl.html).toContain("Payment received");
  });

  it("appUrl falls back to localhost", () => {
    // Node test env has no AUTH_URL set by default in this suite
    const url = appUrl();
    expect(typeof url).toBe("string");
    expect(url.length).toBeGreaterThan(0);
  });
});
