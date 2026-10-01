import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getOrgContext } from "@/lib/tenancy";
import { prisma } from "@/lib/db";
import { planOf, formatInr } from "@/lib/plans";
import { CheckoutClient } from "@/components/checkout-client";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ order_id?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=%2Fbilling%2Fcheckout");

  const ctx = await getOrgContext(session.user.id);
  if (!ctx) redirect("/login?callbackUrl=%2Fbilling%2Fcheckout");

  const { order_id } = await searchParams;
  if (!order_id) redirect("/billing");

  // Org-scoped: an order from another org 404s here.
  const [checkout, org] = await Promise.all([
    prisma.checkoutSession.findFirst({
      where: { razorpayOrderId: order_id, orgId: ctx.orgId },
    }),
    prisma.organization.findUnique({
      where: { id: ctx.orgId },
      select: { name: true },
    }),
  ]);
  if (!checkout || checkout.state !== "CREATED") redirect("/billing");

  const plan = planOf(checkout.plan);
  const publicKeyId = process.env.RAZORPAY_KEY_ID ?? null;

  if (!publicKeyId) {
    // No public key → widget cannot load; send back with guidance.
    redirect("/billing?status=unconfigured");
  }

  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-3xl items-center px-4 sm:px-6">
          <div className="flex items-center gap-2 font-semibold tracking-tight">
            <span aria-hidden className="inline-block h-6 w-6 rounded-md bg-brand" />
            Checkout
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-xl font-semibold tracking-tight">
          {plan.name} — {formatInr(checkout.amountMinor)} / month
        </h1>
        <p className="mt-1 text-sm text-muted">
          {checkout.seats} {checkout.seats === 1 ? "seat" : "seats"} · UPI,
          cards, netbanking and wallets via Razorpay.
        </p>
        <CheckoutClient
          orderId={checkout.razorpayOrderId}
          amountMinor={checkout.amountMinor}
          publicKeyId={publicKeyId}
          orgName={org?.name ?? "Your workspace"}
        />
      </main>
    </div>
  );
}
