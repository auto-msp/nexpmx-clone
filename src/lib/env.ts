import { accessSync, constants as fsConstants } from "node:fs";

/**
 * Boot-time environment validation (resilience follow-up: fail fast).
 *
 * Verified requirements from the codebase:
 * - DATABASE_URL      — every request touches Prisma (src/lib/db.ts)
 * - AUTH_SECRET       — Auth.js v5 requires it; also HMAC download tokens
 *                       (src/lib/auth.ts, src/lib/documents.ts)
 * - AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET — the only login provider
 *
 * Called from src/instrumentation.ts (Next.js boots it once, before the
 * server accepts traffic). Build (next build) does NOT run instrumentation,
 * so CI builds keep working without secrets.
 */

export interface EnvProblem {
  var: string;
  reason: string;
}

export function validateEnv(
  env: Record<string, string | undefined> = process.env,
): EnvProblem[] {
  const problems: EnvProblem[] = [];

  if (!env.DATABASE_URL) {
    problems.push({ var: "DATABASE_URL", reason: "required for database access" });
  }
  if (!env.AUTH_SECRET) {
    problems.push({
      var: "AUTH_SECRET",
      reason: "required for Auth.js sessions and signed download links",
    });
  }
  // In production the login provider is mandatory. In dev/CI the app may run
  // without OAuth configured (login page renders; sign-in will fail) — keep
  // those environments bootable.
  if (env.NODE_ENV === "production") {
    if (!env.AUTH_GOOGLE_ID || !env.AUTH_GOOGLE_SECRET) {
      problems.push({
        var: "AUTH_GOOGLE_ID/AUTH_GOOGLE_SECRET",
        reason: "Google OAuth is the only sign-in method; without it nobody can log in",
      });
    }
  }

  // Document storage: the dir must exist and be writable when provided;
  // default (/var/lib/bizmemory/documents) must be usable too.
  const dir = env.DOCUMENT_STORAGE_DIR ?? "/var/lib/bizmemory/documents";
  try {
    accessSync(dir, fsConstants.W_OK);
  } catch {
    problems.push({
      var: "DOCUMENT_STORAGE_DIR",
      reason: `not writable or missing: ${dir}`,
    });
  }

  return problems;
}

/** Throw with a consolidated report when boot-critical vars are missing. */
export function assertEnvOrFail(): void {
  const problems = validateEnv();
  if (problems.length === 0) return;
  const lines = problems.map((p) => `  - ${p.var}: ${p.reason}`).join("\n");
  console.error(`[boot] environment validation failed:\n${lines}`);
  throw new Error(
    `Missing or invalid environment configuration — refusing to start:\n${lines}`,
  );
}
