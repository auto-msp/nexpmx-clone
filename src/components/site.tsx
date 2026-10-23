import Link from "next/link";

const NAV = [
  { href: "/", label: "Product" },
  { href: "/solutions/client-portal", label: "Client Portal" },
  { href: "/pricing", label: "Pricing" },
  { href: "/intelligence", label: "Intelligence" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex min-h-11 items-center gap-2 font-display text-lg font-semibold">
          <span
            aria-hidden
            className="inline-block h-6 w-6 rounded-[var(--radius-badge)] bg-brand"
          />
          BizMemory
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-6 text-sm text-muted md:flex">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="inline-flex min-h-11 items-center hover:text-text">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/login" className="inline-flex min-h-11 items-center px-1 text-sm text-text-2 hover:text-text">
            Log in
          </Link>
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] bg-brand px-3.5 text-sm font-medium text-on-brand hover:bg-brand-strong sm:min-h-9"
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>© {new Date().getFullYear()} BizMemory. Original reconstruction — not affiliated with any similar product.</p>
        <nav aria-label="Legal" className="flex gap-4">
          <Link href="/terms" className="inline-flex min-h-11 items-center hover:text-text">Terms</Link>
          <Link href="/privacy" className="inline-flex min-h-11 items-center hover:text-text">Privacy</Link>
        </nav>
      </div>
    </footer>
  );
}
