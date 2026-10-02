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
          className="rounded-[var(--radius-control)] border border-border px-3 py-1.5 text-sm text-muted hover:border-brand hover:text-text"
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
          ? "flex items-center justify-center gap-3 border-b border-warn/30 bg-warn/10 px-4 py-2 text-sm text-warn sm:px-6"
          : "flex items-center justify-center gap-3 border-b border-brand/25 bg-brand/10 px-4 py-2 text-sm text-brand sm:px-6"
      }
    >
      <span>
        {days !== null
          ? `Trial: ${days} ${days === 1 ? "day" : "days"} left. Your data stays safe whichever plan you pick.`
          : "Trial active. Your data stays safe whichever plan you pick."}
      </span>
      <a
        href="/settings/plan"
        className="rounded-full bg-brand px-3 py-1 text-xs font-medium text-white hover:bg-brand-strong"
      >
        Choose a plan →
      </a>
      <button
        type="button"
        aria-label="Dismiss"
        className="rounded p-1 opacity-70 hover:opacity-100"
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
        <div className="mt-8 flex flex-col items-center gap-3">
          <a
            href="/billing"
            className="rounded-[var(--radius-control)] bg-brand px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-strong"
          >
            Choose a plan &amp; reactivate
          </a>
          <p className="text-sm text-muted">
            or see the <a href="/pricing" className="text-brand hover:underline">pricing page</a> for details.
          </p>
        </div>
      </div>
    </div>
  );
}
