import type { Metadata } from "next";
import { signInWithGoogle } from "@/app/actions/auth";
import { GoogleIcon } from "@/components/icons";

export const metadata: Metadata = {
  title: "Log in",
  robots: { index: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-[var(--radius-card)] border border-border bg-surface p-8">
        <div className="flex items-center gap-2 font-semibold tracking-tight">
          <span aria-hidden className="inline-block h-6 w-6 rounded-md bg-brand" />
          BizMemory
        </div>
        <h1 className="mt-6 text-xl font-semibold">Log in to your workspace</h1>
        <p className="mt-2 text-sm text-muted">
          One connected memory for your clients, projects, invoices and decisions.
        </p>

        <form action={signInWithGoogle} className="mt-8">
          {/* callbackUrl is validated server-side against open redirects */}
          <input type="hidden" name="callbackUrl" value={callbackUrl ?? "/overview"} />
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-3 rounded-[var(--radius-control)] border border-border bg-surface-2 px-4 py-2.5 text-sm font-medium transition-colors hover:border-brand"
          >
            <GoogleIcon className="h-4 w-4" />
            Continue with Google
          </button>
        </form>

        <p className="mt-6 text-xs leading-relaxed text-muted">
          By continuing you agree to our Terms of Service and acknowledge our
          Privacy Policy.
        </p>
      </div>
    </main>
  );
}
