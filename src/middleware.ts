import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge middleware — the coarse route gate.
 *
 * BEHAVIOR OBSERVED on the target (Confidence A): authenticated app routes
 * redirect to /login with a `callbackUrl` parameter when no session exists,
 * e.g. /overview → /login?callbackUrl=%2Foverview.
 *
 * This is a presence check only. Every server route re-checks the session and
 * org scoping — middleware is never the enforcement point (SECURITY.md).
 */

const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/pricing",
  "/intelligence",
  "/terms",
  "/privacy",
  "/solutions/client-portal",
  "/help",
]);

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/portal/")) return true; // token-authenticated
  if (pathname.startsWith("/invite/")) return true; // capability token; page re-checks session
  return false;
}

function hasSessionCookie(req: NextRequest): boolean {
  // authjs.session-token (http) / __Secure-authjs.session-token (https)
  return Boolean(
    req.cookies.get("authjs.session-token")?.value ??
      req.cookies.get("__Secure-authjs.session-token")?.value,
  );
}

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // API routes enforce their own auth (session or API key) and must answer
  // with JSON status codes, not login redirects.
  if (pathname.startsWith("/api/")) return NextResponse.next();

  // Redirect authenticated users away from the login page.
  if (pathname === "/login" && hasSessionCookie(req)) {
    const url = req.nextUrl.clone();
    url.pathname = "/overview";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (!hasSessionCookie(req) && !isPublic(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/") {
      url.search = `callbackUrl=${encodeURIComponent(pathname + search)}`;
    }
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Everything except Next internals and static assets.
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
