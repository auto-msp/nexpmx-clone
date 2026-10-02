import type { NextConfig } from "next";

/**
 * Security headers are the browser-side baseline (SECURITY.md §Browser).
 * CSP is intentionally strict-but-static; 'unsafe-inline' is allowed for
 * styles because Tailwind injects a small runtime style tag.
 *
 * Dev-only: `next dev` executes modules through eval() (webpack devtool),
 * so hydration dies under a strict script-src with EvalError. Production
 * builds don't eval-wrap modules and keep the strict policy below.
 */
const isDev = process.env.NODE_ENV === "development";
const scriptSrc = isDev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self' 'unsafe-inline'";
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://lh3.googleusercontent.com",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    // Document Hub uploads: server actions carry the file body. 30 MB gives
    // headroom above the 25 MB MAX_UPLOAD_BYTES application cap so users get
    // the app's validation error, not a transport-level rejection.
    serverActions: { bodySizeLimit: "30mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
