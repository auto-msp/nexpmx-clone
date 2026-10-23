"use client";

import { useEffect, useState } from "react";
import { signOutAction } from "@/app/actions/auth";
import { PLANS, formatInr } from "@/lib/plans";

/**
 * Legacy sidebar shell. The app now uses the rail shell in app-rail.tsx;
 * UserMenu/TrialBanner/TrialGate remain here as shared primitives (re-exported
 * by app-rail.tsx for the layout). Kept in one module to avoid duplicate
 * client bundles.
 */

export function UserMenu({ userName }: { userName: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="hidden text-sm text-muted sm:inline">{userName}</span>
      <form action={signOutAction}>
        <button
          type="submit"
          className="min-h-9 rounded-[var(--radius-control)] border border-border-strong px-3 py-1.5 text-sm text-text-2 hover:bg-surface-2 hover:text-text"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}

/**
 * Trial countdown banner: dismissible (per browser session), with a
 * "Choose a plan" pill. Sits under the top bar on every (app) page.
 */
export function TrialBanner({
  view,
}: {
  view: { state: string; daysRemaining: number | null; expired: boolean };
}) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try {
      if (sessionStorage.getItem("bm-trial-banner") === "x") setHidden(true);
    } catch {
      /* storage unavailable */
    }
  }, []);
  if (hidden || view.state !== "TRIALING" || view.expired) return null;
  const urgent = view.daysRemaining !== null && view.daysRemaining <= 3;
  const days = view.daysRemaining;
  return (
    <div
      role="status"
      className={
        urgent
          ? "flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-warn/40 bg-warn-soft px-4 py-2 text-sm text-warn sm:px-6 lg:px-8"
          : "flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-surface px-4 py-2 text-sm text-text-2 sm:px-6 lg:px-8"
      }
    >
      <span className="min-w-0 flex-1">
        {days !== null
          ? `Trial: ${days} ${days === 1 ? "day" : "days"} left. Your data stays safe whichever plan you pick.`
          : "Trial active. Your data stays safe whichever plan you pick."}
      </span>
      <a
        href="/settings/plan"
        className="inline-flex min-h-8 items-center rounded-[var(--radius-control)] bg-brand px-3 text-sm font-medium text-on-brand hover:bg-brand-strong max-md:min-h-11"
      >
        Choose a plan →
      </a>
      <button
        type="button"
        aria-label="Dismiss"
        className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)] text-muted hover:bg-surface-2 hover:text-text max-md:min-w-11"
        onClick={() => {
          setHidden(true);
          try {
            sessionStorage.setItem("bm-trial-banner", "x");
          } catch {
            /* ignore */
          }
        }}
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
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
      <div className="rounded-[var(--radius-card)] border border-border bg-surface p-6 sm:p-8">
        <h1 className="text-2xl">Your trial has ended</h1>
        <p className="mt-3 max-w-prose text-sm text-muted">
          Your 14-day trial of the {plan} plan is over. Your clients, projects,
          documents and decisions are safe and waiting — choose a plan to reopen
          your workspace.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {Object.values(PLANS).map((p) => (
            <div
              key={p.id}
              className="rounded-[var(--radius-control)] border border-border p-4"
            >
              <div className="text-sm font-medium">{p.name}</div>
              <div className="num mt-1 text-lg font-semibold">
                {formatInr(p.pricePerUserMinor)}
                <span className="text-xs font-normal text-muted"> / user / mo</span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-col items-start gap-3">
          <a
            href="/billing"
            className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] bg-brand px-5 text-sm font-medium text-on-brand hover:bg-brand-strong sm:min-h-10"
          >
            Choose a plan &amp; reactivate
          </a>
          <p className="text-sm text-muted">
            or see the <a href="/pricing" className="text-brand underline underline-offset-2 hover:text-brand-strong">pricing page</a> for details.
          </p>
        </div>
      </div>
    </div>
  );
}
