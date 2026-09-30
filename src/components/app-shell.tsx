"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/app/actions/auth";
import { PLANS, formatInr } from "@/lib/plans";

const NAV = [
  { href: "/dashboard", label: "Overview", exact: true },
  { href: "/clients", label: "Clients" },
  { href: "/projects", label: "Projects" },
  { href: "/documents", label: "Documents" },
  { href: "/invoices", label: "Invoices" },
  { href: "/decisions", label: "Decisions" },
  { href: "/assistant", label: "AI Assistant" },
  { href: "/settings", label: "Settings" },
];

export function AppSidebar({
  plan,
  orgName,
  trial,
}: {
  plan: string;
  orgName: string;
  trial?: { daysRemaining: number | null; expired: boolean } | null;
}) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface/50 md:flex">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4 font-semibold tracking-tight">
        <span aria-hidden className="inline-block h-6 w-6 rounded-md bg-brand" />
        <span className="truncate">{orgName}</span>
      </div>
      <nav aria-label="App" className="flex-1 space-y-1 p-3">
        {NAV.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "block rounded-[var(--radius-control)] bg-brand/15 px-3 py-2 text-sm font-medium text-brand"
                  : "block rounded-[var(--radius-control)] px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-text"
              }
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-3 text-xs text-muted">
        <div>
          Plan: <span className="font-medium text-text">{plan}</span>
        </div>
        {trial && !trial.expired && trial.daysRemaining !== null ? (
          <div className="mt-1">
            Trial: <span className="font-medium text-text">{trial.daysRemaining} {trial.daysRemaining === 1 ? "day" : "days"} left</span>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

export function UserMenu({ userName }: { userName: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="hidden text-sm text-muted sm:inline">{userName}</span>
      <form action={signOutAction}>
        <button
          type="submit"
          className="rounded-[var(--radius-control)] border border-border px-3 py-1.5 text-sm text-muted hover:border-brand hover:text-text"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}

/**
 * Trial countdown banner (evidence-backed: 14-day trial at signup,
 * docs/ASSUMPTIONS.md §8). Sits under the header on every (app) page.
 */
export function TrialBanner({
  view,
}: {
  view: { state: string; daysRemaining: number | null; expired: boolean };
}) {
  if (view.state !== "TRIALING" || view.expired) return null;
  const urgent = view.daysRemaining !== null && view.daysRemaining <= 3;
  return (
    <div
      role="status"
      className={
        urgent
          ? "border-b border-warn/30 bg-warn/10 px-4 py-2 text-center text-sm text-warn sm:px-6"
          : "border-b border-brand/20 bg-brand/10 px-4 py-2 text-center text-sm text-brand sm:px-6"
      }
    >
      {view.daysRemaining !== null
        ? `Trial — ${view.daysRemaining} ${view.daysRemaining === 1 ? "day" : "days"} left. Choose a plan any time from Settings.`
        : "Trial active. Choose a plan any time from Settings."}
    </div>
  );
}

/**
 * Expired-trial gate: replaces app content when the org is not entitled.
 * Server actions are gated separately (requireEntitlement) — this is the
 * UI half of RULE-ENT-04.
 */
export function TrialGate({ plan }: { plan: string }) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-[var(--radius-card)] border border-border bg-surface p-8 text-center">
        <h1 className="text-xl font-semibold tracking-tight">Your trial has ended</h1>
        <p className="mt-3 text-sm text-muted">
          Your 14-day trial of the {plan} plan is over. Your clients, projects,
          documents and decisions are safe and waiting — choose a plan to reopen
          your workspace.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {Object.values(PLANS).map((p) => (
            <div
              key={p.id}
              className="rounded-[var(--radius-control)] border border-border p-4 text-left"
            >
              <div className="text-sm font-medium">{p.name}</div>
              <div className="mt-1 text-lg font-semibold">
                {formatInr(p.pricePerUserMinor)}
                <span className="text-xs font-normal text-muted"> / user / mo</span>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-8 text-sm text-muted">
          Billing is not wired up yet — contact us to activate a plan, or see the{" "}
          <a href="/pricing" className="text-brand hover:underline">pricing page</a> for details.
        </p>
      </div>
    </div>
  );
}
