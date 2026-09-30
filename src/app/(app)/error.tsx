"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Client-side breadcrumb; server-side logging happens in the action/route.
    console.error("[app-error]", error.message);
  }, [error]);

  return (
    <div className="rounded-[var(--radius-card)] border border-danger/40 bg-danger/5 p-8 text-center">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted">
        The action could not be completed. Your data is safe — try again.
      </p>
      {error.digest ? (
        <p className="mt-1 text-xs text-muted">Reference: {error.digest}</p>
      ) : null}
      <button
        onClick={reset}
        className="mt-6 rounded-[var(--radius-control)] bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-strong"
      >
        Try again
      </button>
    </div>
  );
}
