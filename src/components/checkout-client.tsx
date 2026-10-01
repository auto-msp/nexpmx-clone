"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Razorpay Checkout widget host.
 *
 * The widget script is loaded from checkout.razorpay.com only when
 * RAZORPAY_KEY_ID is configured (the server renders this component only in
 * that case). The callback posts the provider-signed
 * order_id|payment_id|signature triple to verifyCheckout (server action).
 *
 * Activation authority stays with the webhook: if the widget callback never
 * fires, the webhook still activates the subscription and /billing reflects
 * it on next load.
 */

type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => void;
  prefill?: { name?: string; email?: string };
  theme?: { color?: string };
  modal?: { ondismiss?: () => void };
};

interface RazorpayConstructor {
  new (options: RazorpayOptions): { open: () => void };
}

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

export function CheckoutClient({
  orderId,
  amountMinor,
  publicKeyId,
  orgName,
}: {
  orderId: string;
  amountMinor: number;
  publicKeyId: string;
  orgName: string;
}) {
  const [state, setState] = useState<"idle" | "opening" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (window.Razorpay) return;
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);
    return () => {
      script.remove();
    };
  }, []);

  async function submitVerify(formData: FormData) {
    const { verifyCheckout } = await import("@/app/actions/billing");
    try {
      await verifyCheckout(formData);
    } catch (err) {
      setState("error");
      setMessage(
        err instanceof Error ? err.message : "Verification failed — try again.",
      );
    }
  }

  function openCheckout() {
    setState("opening");
    if (!window.Razorpay) {
      setState("error");
      setMessage("Payment widget failed to load. Check your connection and retry.");
      return;
    }
    const rzp = new window.Razorpay({
      key: publicKeyId,
      amount: amountMinor,
      currency: "INR",
      name: orgName,
      description: "BizMemory subscription",
      order_id: orderId,
      handler: (response) => {
        const fd = new FormData();
        fd.set("razorpay_order_id", response.razorpay_order_id);
        fd.set("razorpay_payment_id", response.razorpay_payment_id);
        fd.set("razorpay_signature", response.razorpay_signature);
        void submitVerify(fd);
      },
      modal: {
        ondismiss: () => {
          setState("idle");
          setMessage("Payment window closed before completion. You can retry any time.");
        },
      },
      theme: { color: "#2563eb" },
    });
    rzp.open();
  }

  return (
    <div className="mt-8">
      <button
        type="button"
        onClick={openCheckout}
        disabled={state === "opening"}
        className="rounded-[var(--radius-control)] bg-brand px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-strong disabled:opacity-50"
      >
        {state === "opening" ? "Waiting for payment…" : "Pay now"}
      </button>

      {message ? (
        <p
          role="status"
          className={
            state === "error"
              ? "mt-4 text-sm text-danger"
              : "mt-4 text-sm text-muted"
          }
        >
          {message}
        </p>
      ) : null}

      <p className="mt-6 text-xs text-muted">
        After payment, activation completes automatically via our payment
        provider&apos;s signed webhook — usually within seconds. If your
        workspace does not reopen within a minute, reload the billing page;
        your payment is never lost.
      </p>

      {/* Hidden form kept for verify submission parity with server actions. */}
      <form ref={formRef} action={submitVerify} className="hidden" />
    </div>
  );
}
