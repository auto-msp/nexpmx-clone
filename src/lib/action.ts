import { requireApiContext } from "@/lib/api";
import { requirePermission, type Permission } from "@/lib/rbac";
import type { OrgContext } from "@/lib/tenancy";

/**
 * Shared server-action plumbing for the page rebuild.
 *
 * Production Next masks the message of any error thrown from a server action,
 * so every action used with <ActionForm> RETURNS a result instead of throwing:
 *
 *   export async function createThing(fd: FormData) {
 *     "use server" is declared at the top of the actions FILE, not here.
 *     return runAction("project:write", async (ctx) => { ...; return { id, message: "Created" }; });
 *   }
 *
 * - validation / permission / business-rule errors become { ok:false, error }
 * - `redirect` in the success value makes <ActionForm> navigate there
 */
export type ActionResult =
  | { ok: true; id?: string; message?: string; redirect?: string }
  | { ok: false; error: string };

export type ActionContext = OrgContext & { email: string | null };

export async function runAction(
  permission: Permission | null,
  fn: (ctx: ActionContext) => Promise<{ id?: string; message?: string; redirect?: string } | void>,
): Promise<ActionResult> {
  try {
    const ctx = await requireApiContext();
    if (permission) requirePermission(ctx.role, permission);
    const out = (await fn(ctx)) ?? {};
    return { ok: true, ...out };
  } catch (err) {
    const e = err as Error & { status?: number; issues?: Array<{ message: string }> };
    if (e?.issues?.length) return { ok: false, error: e.issues.map((i) => i.message).join("; ") };
    if (e?.status === 403) return { ok: false, error: "You don't have permission to do that." };
    if (e?.status === 401) return { ok: false, error: "Please sign in again." };
    if (e?.message && /NEXT_REDIRECT/.test(e.message)) throw err; // let redirect() through
    console.error("[action]", e);
    return { ok: false, error: e?.message || "Something went wrong. Please try again." };
  }
}

/* ── FormData helpers ───────────────────────────────────────────────────── */

export function fStr(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}
export function fOpt(fd: FormData, key: string): string | null {
  const v = fStr(fd, key);
  return v ? v : null;
}
export function fInt(fd: FormData, key: string, fallback = 0): number {
  const n = parseInt(String(fd.get(key) ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}
/** Rupee amount typed by the user ("1,250.50") → integer paise. */
export function fMoneyMinor(fd: FormData, key: string): number {
  const raw = String(fd.get(key) ?? "").replace(/[^0-9.\-]/g, "");
  const n = parseFloat(raw);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
export function fDate(fd: FormData, key: string): Date | null {
  const v = fStr(fd, key);
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
export function fBool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "true" || v === "1";
}
/** Idempotency key posted by <ActionForm> as `ik`. */
export function fIk(fd: FormData): string {
  const ik = fStr(fd, "ik");
  if (!/^[a-f0-9]{16,64}$/.test(ik)) {
    throw new Error("This form expired. Reload the page and try again.");
  }
  return ik;
}
