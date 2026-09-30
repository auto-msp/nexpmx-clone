"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/app/actions/auth";

const NAV = [
  { href: "/dashboard", label: "Overview", exact: true },
  { href: "/clients", label: "Clients" },
  { href: "/projects", label: "Projects" },
  { href: "/invoices", label: "Invoices" },
  { href: "/decisions", label: "Decisions" },
  { href: "/assistant", label: "AI Assistant" },
  { href: "/settings", label: "Settings" },
];

export function AppSidebar({ plan, orgName }: { plan: string; orgName: string }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface/50 md:flex">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4 font-semibold tracking-tight">
        <span aria-hidden className="inline-block h-6 w-6 rounded-md bg-brand" />
        <span className="truncate">{orgName}</span>
      </div>
      <nav aria-label="App" className="flex-1 space-y-1 p-3">
        {NAV.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "block rounded-[var(--radius-control)] bg-brand/15 px-3 py-2 text-sm font-medium text-brand"
                  : "block rounded-[var(--radius-control)] px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-text"
              }
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-3 text-xs text-muted">
        Plan: <span className="font-medium text-text">{plan}</span>
      </div>
    </aside>
  );
}

export function UserMenu({ userName }: { userName: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="hidden text-sm text-muted sm:inline">{userName}</span>
      <form action={signOutAction}>
        <button
          type="submit"
          className="rounded-[var(--radius-control)] border border-border px-3 py-1.5 text-sm text-muted hover:border-brand hover:text-text"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
