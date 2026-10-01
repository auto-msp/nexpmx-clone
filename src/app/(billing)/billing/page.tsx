import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getOrgContext } from "@/lib/tenancy";
import { prisma } from "@/lib/db";
import { planOf, PLANS, formatInr } from "@/lib/plans";
import { seatsInUse } from "@/lib/seats";
import { isBillingConfigured } from "@/lib/razorpay";
import {
  getOrCreateSubscription,
  subscriptionView,
} from "@/lib/subscription";
import { beginCheckout } from "@/app/actions/billing";
import { PlanChooser } from "@/components/billing-form";

export const metadata: Metadata = { title: "Plans & billing", robots: { index: false } };

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=%2Fbilling");

  const ctx = await getOrgContext(session.user.id);
  if (!ctx) redirect("/login?callbackUrl=%2Fbilling");

  const { status } = await searchParams;
  const org = await prisma.organization.findUnique({
    where: { id: ctx.orgId },
    select: { name: true, plan: true },
  });
  const plan = planOf(org?.plan);
  const sub = await getOrCreateSubscription(ctx.orgId);
  const view = subscriptionView(sub);
  const seatsUsed = await seatsInUse(ctx.orgId);
  const billingReady = isBillingConfigured();

  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2 font-semibold tracking-tight">
            <span aria-hidden className="inline-block h-6 w-6 rounded-md bg-brand" />
            {org?.name ?? "Workspace"}
          </div>
          <Link
            href="/overview"
            className="text-sm text-muted hover:text-text"
          >
            Back to workspace
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Plans &amp; billing</h1>
        <p className="mt-1 text-sm text-muted">
          Per-user monthly pricing. Your data stays safe in every state —
          activation reopens the workspace instantly.
        </p>

        {view.entitled ? (
          <div className="mt-6 rounded-[var(--radius-card)] border border-border bg-surface p-5 text-sm">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <span>
                Current plan:{" "}
                <span className="font-semibold text-text">{plan.name}</span>
              </span>
              <span className="text-muted">
                {view.state === "TRIALING"
                  ? `Trial — ${view.daysRemaining} ${view.daysRemaining === 1 ? "day" : "days"} left`
                  : view.state === "ACTIVE"
                    ? sub.currentPeriodEnd
                      ? `Renews ${sub.currentPeriodEnd.toISOString().slice(0, 10)}`
                      : "Active"
                    : view.state}
              </span>
              <span className="text-muted">
                {seatsUsed} {seatsUsed === 1 ? "seat" : "seats"} in use
              </span>
            </div>
          </div>
        ) : (
          <div
            role="status"
            className="mt-6 rounded-[var(--radius-card)] border border-warn/40 bg-warn/10 p-5 text-sm"
          >
            Your 14-day trial has ended. Choose a plan below to reopen your
            workspace — clients, projects, documents and decisions are waiting.
          </div>
        )}

        {status === "verified" ? (
          <div
            role="status"
            className="mt-6 rounded-[var(--radius-card)] border border-brand/40 bg-brand/10 p-4 text-sm"
          >
            Payment received — activation completes automatically within
            moments. Reload this page to see your new plan.
          </div>
        ) : null}
        {status === "activated" ? (
          <div
            role="status"
            className="mt-6 rounded-[var(--radius-card)] border border-brand/40 bg-brand/10 p-4 text-sm"
          >
            Plan activated. Your workspace is open.
          </div>
        ) : null}
        {status === "canceled" ? (
          <div
            role="status"
            className="mt-6 rounded-[var(--radius-card)] border border-danger/40 bg-danger/5 p-4 text-sm"
          >
            Subscription canceled.
          </div>
        ) : null}

        <PlanChooser
          plans={Object.values(PLANS)}
          currentPlan={plan.id}
          seatsUsed={seatsUsed}
          billingReady={billingReady}
          action={beginCheckout}
          canManage={ctx.role === "OWNER"}
        />
      </main>
    </div>
  );
}
