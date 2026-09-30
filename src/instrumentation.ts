/**
 * Next.js instrumentation hook — runs ONCE when the server process boots,
 * before it accepts traffic (not during `next build`).
 *
 * Fail-fast contract: if boot-critical configuration is missing, the process
 * exits with a clear, consolidated error instead of serving 500s per request.
 * systemd (`Restart=always`) will retry, and the journal shows the exact
 * cause — see runbooks/application-down.md.
 *
 * The NEXT_RUNTIME guard is the documented pattern for Node-only work:
 * env.ts touches `node:fs`, so it must only be bundled for the nodejs
 * runtime (the edge bundle cannot resolve node: built-ins).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertEnvOrFail } = await import("@/lib/env");
    assertEnvOrFail();
  }
}
