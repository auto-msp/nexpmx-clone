import Link from "next/link";

export default function RootNotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">404</h1>
        <p className="mt-2 text-muted">This page does not exist.</p>
        <Link href="/" className="mt-6 inline-block text-sm text-brand hover:underline">
          Back to home →
        </Link>
      </div>
    </main>
  );
}
