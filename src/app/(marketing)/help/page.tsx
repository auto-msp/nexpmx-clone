import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Help center",
  description: "Answers about BizMemory — accounts, plans, memory, AI and billing.",
};

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "How do I sign in?",
    a: "BizMemory uses Google sign-in. Click Continue with Google on the login page and approve the requested profile scopes. Your workspace is created automatically on first sign-in.",
  },
  {
    q: "What happens after the 14-day trial?",
    a: "Every account starts on a 14-day trial. When it ends, your data is preserved but the workspace locks until you pick a plan from the billing page.",
  },
  {
    q: "What is Business Memory?",
    a: "Durable facts about how your business runs — payment terms, deploy windows, client preferences. Add them one at a time, import a list, or answer memory questions; everything becomes context your AI reads.",
  },
  {
    q: "Who are the AI employees?",
    a: "Role-carded virtual employees: a project manager, finance, operations, client success and sales. Each has an owned remit and follows the skills you assign from the library.",
  },
  {
    q: "How do automations run?",
    a: "An automation watches for a trigger — an invoice paid, a proposal signed, a project created — and performs actions: notify the team, notify the client, create a follow-up task. Install ready-made recipes or build your own.",
  },
  {
    q: "Can my clients see their files?",
    a: "Yes. Share documents through the client portal: each client gets a private, token-authenticated read-only view of their projects, invoices and shared files.",
  },
  {
    q: "How do AI credits work?",
    a: "Each plan includes a monthly credit allowance. Searches, briefs and enabled AI employees draw against it; the meter in the app shows the running total.",
  },
  {
    q: "How is my data protected?",
    a: "Org data is isolated per account, uploads are scanned for type and size, downloads use short-lived signed links, and audit logs record every mutation. See the privacy page for the full policy.",
  },
];

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Help center</h1>
      <p className="mt-2 text-sm text-muted">
        Short answers to the questions we hear most. For anything else, contact the workspace owner
        or reach the team from the app footer.
      </p>

      <div className="mt-10 space-y-3">
        {FAQS.map((f) => (
          <details
            key={f.q}
            className="rounded-[var(--radius-card)] border border-border bg-surface px-5 py-4"
          >
            <summary className="cursor-pointer text-sm font-medium text-text">{f.q}</summary>
            <p className="mt-2 text-sm leading-relaxed text-muted">{f.a}</p>
          </details>
        ))}
      </div>

      <div className="mt-10 rounded-[var(--radius-card)] border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold tracking-tight">Still stuck?</h2>
        <p className="mt-2 text-sm text-muted">
          Ask your workspace's AI assistant first — it answers from your own memory. For account
          issues, use the contact address on the terms page.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link href="/pricing" className="text-brand hover:underline">Pricing →</Link>
          <Link href="/privacy" className="text-brand hover:underline">Privacy →</Link>
          <Link href="/terms" className="text-brand hover:underline">Terms →</Link>
          <Link href="/login" className="text-brand hover:underline">Sign in →</Link>
        </div>
      </div>
    </div>
  );
}
