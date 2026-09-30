import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  robots: { index: false },
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-4 text-sm text-muted">
        This placeholder policy must be replaced by your own privacy policy
        before production use. If you enable AI features with an external
        provider, document what is sent to that provider here.
      </p>
    </div>
  );
}
