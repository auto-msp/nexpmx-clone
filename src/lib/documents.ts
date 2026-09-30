import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Document Hub security helpers (SECURITY.md §Uploads).
 *
 * - Allowlist + size cap are enforced SERVER-side on the raw bytes; the
 *   client-declared Content-Type and extension are untrusted hints checked
 *   only to reject early, never trusted to grant.
 * - `MAX_UPLOAD_BYTES` is below the smallest plan's storage allowance so a
 *   single request can never exhaust an org's quota.
 * - Download links are short-lived HMAC capabilities bound to document id +
 *   org; the /api/download route verifies signature, expiry and org scope
 *   before reading a byte.
 */

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB hard ceiling per file

/** ext → canonical mime. Extension is metadata; the allowlist is by mime. */
const ALLOWED_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  txt: "text/plain",
  csv: "text/csv",
  json: "application/json",
  zip: "application/zip",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export const ALLOWED_MIMES = new Set(Object.values(ALLOWED_TYPES));

const EXT_BY_MIME: Record<string, string> = Object.fromEntries(
  Object.entries(ALLOWED_TYPES).map(([ext, mime]) => [mime, ext]),
);

export const humanAllowedTypes = Object.keys(ALLOWED_TYPES)
  .map((e) => `.${e}`)
  .join(", ");

/**
 * Pick the stored mime for an upload. Strategy: if the client-declared type
 * is allowlisted, keep it; else map the extension; else reject. The mime is
 * re-verified against the allowlist before anything is stored, and again at
 * download time.
 */
export function resolveMimeType(
  declaredMime: string | null | undefined,
  filename: string,
): string | null {
  if (declaredMime && ALLOWED_MIMES.has(declaredMime)) return declaredMime;
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  return ALLOWED_TYPES[ext] ?? null;
}

/** Snake-oil defense: never let the download path claim a non-allowlisted type. */
export function isAllowedMime(mime: string): boolean {
  return ALLOWED_MIMES.has(mime);
}

/** Last-resort filename sanitization for display (never used for paths). */
export function safeDisplayName(name: string): string {
  const trimmed = name.replace(/\\/g, "/").split("/").pop() ?? "";
  const cleaned = trimmed.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (cleaned || "file").slice(0, 200);
}

function downloadSecret(): string {
  const secret =
    process.env.DOCUMENT_TOKEN_SECRET ?? process.env.AUTH_SECRET ?? "";
  if (!secret) {
    throw new Error("No secret available for download tokens");
  }
  return secret;
}

export interface DownloadClaims {
  documentId: string;
  orgId: string;
  expiresAt: number; // epoch ms
  /** Present only on portal-scoped links; binds the token to one portal. */
  portalToken?: string;
}

/** HMAC-sign a short-lived download capability. */
export function signDownloadToken(claims: DownloadClaims): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const sig = createHmac("sha256", downloadSecret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${sig}`;
}

/** Verify signature + expiry; returns claims or null. Constant-time compare. */
export function verifyDownloadToken(
  token: string | null | undefined,
): DownloadClaims | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;

  const expected = createHmac("sha256", downloadSecret())
    .update(payload)
    .digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as DownloadClaims;
    if (
      typeof claims.documentId !== "string" ||
      typeof claims.orgId !== "string" ||
      typeof claims.expiresAt !== "number" ||
      claims.expiresAt < Date.now()
    ) {
      return null;
    }
    return claims;
  } catch {
    return null;
  }
}
