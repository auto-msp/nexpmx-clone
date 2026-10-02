"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/kit-icons";
import { cx } from "@/components/ui";

const GROUPS: Array<{
  label: string;
  items: Array<{ href: string; title: string; desc: string; icon: string }>;
}> = [
  {
    label: "You",
    items: [
      { href: "/settings", title: "Profile", desc: "Your name, role and capacity", icon: "user" },
      { href: "/settings/notifications", title: "Notifications", desc: "What reaches you, and how", icon: "bell" },
    ],
  },
  {
    label: "Workspace",
    items: [
      { href: "/settings/company", title: "Company & GST", desc: "Legal name, address, tax details", icon: "building" },
      { href: "/settings/ai", title: "AI", desc: "How your AI teammates behave", icon: "sparkle" },
      { href: "/settings/team", title: "Team directory", desc: "Members, roles and invitations", icon: "users" },
    ],
  },
  {
    label: "Billing",
    items: [{ href: "/settings/plan", title: "Plan & usage", desc: "What you pay, seats and credits", icon: "wallet" }],
  },
  {
    label: "Security",
    items: [
      { href: "/settings/privacy", title: "Data & privacy", desc: "What we store, keys and exports", icon: "eye" },
      { href: "/settings/audit", title: "Audit log", desc: "Who changed what, and when", icon: "clock" },
    ],
  },
];

export function SettingsNav() {
  const pathname = usePathname() ?? "";
  const isActive = (href: string) => (href === "/settings" ? pathname === "/settings" : pathname === href || pathname.startsWith(href + "/"));

  return (
    <nav
      aria-label="Settings sections"
      className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-col lg:gap-5 lg:overflow-visible lg:px-0 lg:pb-0"
    >
      {GROUPS.map((g) => (
        <div key={g.label} className="flex shrink-0 gap-1 lg:flex-col">
          <div className="hidden px-3 pb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted lg:block">{g.label}</div>
          {g.items.map((it) => {
            const active = isActive(it.href);
            return (
              <Link
                key={it.href}
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex items-center gap-3 whitespace-nowrap rounded-[var(--radius-control)] border px-3 py-2 lg:items-start lg:whitespace-normal",
                  active ? "border-brand/50 bg-brand/10 text-text" : "border-transparent text-muted hover:bg-surface-2 hover:text-text",
                )}
              >
                <Icon name={it.icon} className={cx("h-4 w-4 shrink-0 lg:mt-0.5", active ? "text-brand" : "")} />
                <span className="min-w-0">
                  <span className={cx("block text-sm", active ? "font-medium" : "")}>{it.title}</span>
                  <span className="hidden text-xs text-muted lg:block">{it.desc}</span>
                </span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
