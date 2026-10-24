/**
 * Email delivery adapter (provider-agnostic, like src/lib/ai.ts).
 *
 * PROVENANCE/DESIGN: the product sends three kinds of transactional email —
 * team invitations, automation notifications, and (later) invoice mail-merge.
 * The provider is swappable: implement `MailProvider` with any vendor. The
 * default `resendProvider` uses Resend's plain REST API via fetch (no SDK
 * dependency, no bundle weight). Without RESEND_API_KEY the `nullProvider`
 * logs the intent — dev/CI never sends, and delivery attempts are still
 * auditable via the returned result.
 *
 * Hard rules (SECURITY.md):
 * - Send is fire-and-protect: failures are logged, never thrown into the
 *   business path (an invite must be creatable even if the mail API is down;
 *   the link is still shown to the admin — same fallback as today).
 * - Never log the raw invite token; only recipient + template name.
 * - From-address falls back to the onboarding sender; custom domains must be
 *   verified in the provider dashboard first.
 */

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Logical template name for audit/logging (never includes secrets). */
  template: "invite" | "automation" | "test";
}

export interface MailResult {
  sent: boolean;
  provider: "resend" | "null";
  /** Provider message id when sent; human-readable reason when not. */
  id?: string;
  error?: string;
}

export interface MailProvider {
  send(message: MailMessage): Promise<MailResult>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Baseline sanity on the recipient — the caller's data is untrusted. */
export function isPlausibleEmail(email: string): boolean {
  return email.length <= 254 && EMAIL_RE.test(email);
}

function fromAddress(): string {
  const name = process.env.MAIL_FROM_NAME ?? "BizMemory";
  const addr = process.env.MAIL_FROM_ADDRESS ?? "onboarding@resend.dev";
  return `${name} <${addr}>`;
}

// ── Resend REST adapter ──────────────────────────────────────────────────────

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export const resendProvider: MailProvider = {
  async send(message) {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      return nullProvider.send(message);
    }
    if (!isPlausibleEmail(message.to)) {
      return { sent: false, provider: "resend", error: "invalid recipient" };
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress(),
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        // 4xx = config problem (bad key, unverified domain) — log loudly once.
        console.error(
          `[mail] resend ${res.status} for template=${message.template}: ${body.slice(0, 200)}`,
        );
        return { sent: false, provider: "resend", error: `HTTP ${res.status}` };
      }
      const data = (await res.json().catch(() => ({}))) as { id?: string };
      return { sent: true, provider: "resend", id: data.id };
    } catch (err) {
      console.error(`[mail] resend failed for template=${message.template}`, err);
      return { sent: false, provider: "resend", error: "network error" };
    }
  },
};

// ── Null adapter (no key configured) ────────────────────────────────────────

export const nullProvider: MailProvider = {
  async send(message) {
    console.log(
      `[mail:null] would send template=${message.template} to=${message.to} subject="${message.subject}"`,
    );
    return { sent: false, provider: "null", error: "no mail provider configured" };
  },
};

export function getMailProvider(): MailProvider {
  return process.env.RESEND_API_KEY ? resendProvider : nullProvider;
}

// ── Templates (original copy) ────────────────────────────────────────────────

export function inviteEmail(input: {
  inviterName: string;
  orgName: string;
  roleName: string;
  inviteUrl: string;
  expiresOn: string;
}): { subject: string; html: string; text: string } {
  const subject = `You're invited to join ${input.orgName} on BizMemory`;
  const text = [
    `${input.inviterName} invited you to join ${input.orgName} on BizMemory as ${input.roleName}.`,
    `Accept by ${input.expiresOn}: ${input.inviteUrl}`,
    "This link works once and only for this email address.",
  ].join("\n");
  const html = `
<p><strong>${escapeHtml(input.inviterName)}</strong> invited you to join
<strong>${escapeHtml(input.orgName)}</strong> on BizMemory as <em>${escapeHtml(input.roleName)}</em>.</p>
<p><a href="${input.inviteUrl}">Accept the invitation</a></p>
<p class="muted">This one-time link expires on ${escapeHtml(input.expiresOn)} and works only for the
address it was sent to. If you weren't expecting it, ignore this email.</p>`.trim();
  return { subject, html, text };
}

export function automationEmail(input: {
  orgName: string;
  title: string;
  detail: string;
  appUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = `${input.orgName}: ${input.title}`;
  const text = `${input.detail}\n\nOpen BizMemory: ${input.appUrl}`;
  const html = `
<p>${escapeHtml(input.detail)}</p>
<p><a href="${input.appUrl}">Open BizMemory</a></p>`.trim();
  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** App URL used in email links (auth origin by default). */
export function appUrl(): string {
  return (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
