"use client";

import { useState } from "react";
import { formatInr, PlanDefinition } from "@/lib/plans";

/**
 * Plan chooser for /billing. Submits to the server action (beginCheckout),
 * which creates a Razorpay order with a server-computed quote and redirects
 * to /billing/checkout. The browser never states an amount.
 *
 * Declaring `any` for the action prop keeps this component server-action
 * agnostic in tests/stories; the real action is passed from the page.
 */
export function PlanChooser({
  plans,
  currentPlan,
  seatsUsed,
  billingReady,
  action,
  canManage,
}: {
  plans: PlanDefinition[];
  currentPlan: string;
  seatsUsed: number;
  billingReady: boolean;
  action: (formData: FormData) => Promise<void>;
  canManage: boolean;
}) {
  const [selected, setSelected] = useState<string>(
    plans.find((p) => p.id === currentPlan)?.id ?? plans[0]?.id ?? "STARTER",
  );
  const [seats, setSeats] = useState<string>(String(Math.max(1, seatsUsed)));

  const selectedPlan = plans.find((p) => p.id === selected) ?? plans[0];
  const seatCount = Number.parseInt(seats, 10);
  const validSeats = Number.isSafeInteger(seatCount) && seatCount >= 1 && seatCount <= 10_000;
  const seatsCoverUsage = validSeats && seatCount >= seatsUsed;
  const monthly = validSeats ? (selectedPlan?.pricePerUserMinor ?? 0) * seatCount : 0;

  if (!canManage) {
    return (
      <p className="mt-8 text-sm text-muted">
        Only the workspace owner can change the plan. Ask your owner to choose
        one from this page.
      </p>
    );
  }

  return (
    <div className="mt-8">
      <div className="grid gap-4 sm:grid-cols-3">
        {plans.map((p) => {
          const active = p.id === selected;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelected(p.id)}
              aria-pressed={active}
              className={
                active
                  ? "rounded-[var(--radius-card)] border-2 border-brand bg-surface p-5 text-left"
                  : "rounded-[var(--radius-card)] border border-border bg-surface p-5 text-left hover:border-brand/50"
              }
            >
              <div className="text-sm font-medium">{p.name}</div>
              <div className="mt-1 text-xl font-semibold">
                {formatInr(p.pricePerUserMinor)}
                <span className="text-xs font-normal text-muted"> / user / mo</span>
              </div>
              <p className="mt-2 text-xs text-muted">{p.blurb}</p>
              {p.id === currentPlan ? (
                <span className="mt-3 inline-block rounded-full bg-brand/10 px-2 py-0.5 text-xs text-brand">
                  current
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <form action={action} className="mt-8 flex flex-wrap items-end gap-4">
        <input type="hidden" name="plan" value={selected} />
        <div>
          <label
            htmlFor="billing-seats"
            className="block text-sm font-medium"
          >
            Seats (users)
          </label>
          <input
            id="billing-seats"
            name="seats"
            type="number"
            min={1}
            max={10_000}
            value={seats}
            onChange={(e) => setSeats(e.target.value)}
            className="mt-1 w-32 rounded-[var(--radius-control)] border border-border bg-surface px-3 py-2 text-sm"
          />
        </div>
        <div className="text-sm text-muted">
          {validSeats && seatsCoverUsage ? (
            <>
              Total:{" "}
              <span className="font-semibold text-text">{formatInr(monthly)}</span>{" "}
              / month
            </>
          ) : (
            <span className="text-warn">
              {validSeats
                ? `Your workspace uses ${seatsUsed} seat(s) — include them all.`
                : "Enter a seat count between 1 and 10,000."}
            </span>
          )}
        </div>
        <button
          type="submit"
          disabled={!validSeats || !seatsCoverUsage}
          className="rounded-[var(--radius-control)] bg-brand px-5 py-2 text-sm font-medium text-white hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50"
        >
          {billingReady ? "Continue to payment" : "Contact us to activate"}
        </button>
      </form>

      {!billingReady ? (
        <p className="mt-3 text-xs text-muted">
          Online checkout is being wired up. Meanwhile, your owner account can
          activate a plan instantly from this page once support confirms.
        </p>
      ) : null}
    </div>
  );
}
