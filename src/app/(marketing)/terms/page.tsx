import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  robots: { index: false },
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Terms of Service</h1>
      <p className="mt-4 text-sm text-muted">
        These placeholder terms must be replaced by your own legal agreement
        before production use. They are included only to complete the public
        route surface of this reconstruction.
      </p>
    </div>
  );
}
