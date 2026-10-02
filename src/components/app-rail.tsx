"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { signOutAction } from "@/app/actions/auth";
import { Icon } from "@/components/kit-icons";
import { Avatar } from "@/components/kit";
import { cx } from "@/components/ui";
import type { SubnavData } from "@/lib/subnav";

/**
 * App shell: left icon rail (modules) → contextual sub-sidebar (links, live
 * lists, "AI in this domain", credits meter, focus timer, user card) → top bar
 * (page title, search, theme, notifications, avatar). All copy is original.
 */

export interface NavLink {
  href: string;
  label: string;
}
export interface RailItem {
  href: string;
  label: string;
  icon: string;
  /** Path prefixes that belong to this module (for active state). */
  match: string[];
  sections: Array<{ label: string; items: NavLink[] }>;
  ai?: NavLink[];
}

export const RAIL_ICONS: Record<string, React.ReactNode> = {
  home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" /></svg>,
  clients: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M16 3.5a4 4 0 0 1 0 7" /><path d="M21 21v-2a4 4 0 0 0-3-3.85" /></svg>,
  projects: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /></svg>,
  proposals: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M7 3h8l4 4v14H7z" /><path d="M15 3v4h4" /><path d="M10 12h6M10 16h6" /></svg>,
  finance: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /><path d="M7 15h4" /></svg>,
  comms: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5Z" /></svg>,
  ai: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="5" y="7" width="14" height="12" rx="3" /><path d="M12 4v3" /><circle cx="9.5" cy="12.5" r="1" fill="currentColor" /><circle cx="14.5" cy="12.5" r="1" fill="currentColor" /><path d="M9 16.5h6" /></svg>,
  cio: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3l2.5 5.5L20 11l-5.5 2.5L12 19l-2.5-5.5L4 11l5.5-2.5z" /></svg>,
  memory: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10Z" /></svg>,
  docs: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 4h11l5 5v11H4z" /><path d="M15 4v5h5" /></svg>,
  sheets: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M9 9v11M15 9v11" /></svg>,
  setup: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3.2" /><path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M18.5 5.5l-2.1 2.1M7.6 16.4l-2.1 2.1" /></svg>,
};

export const MODULES: RailItem[] = [
  {
    href: "/dashboard",
    label: "Home",
    icon: "home",
    match: ["/dashboard", "/tasks", "/goals", "/calendar", "/notifications", "/reports", "/guide"],
    sections: [
      {
        label: "Workspace",
        items: [
          { href: "/dashboard", label: "Command center" },
          { href: "/tasks", label: "Tasks" },
          { href: "/goals", label: "Goals" },
          { href: "/calendar", label: "Calendar" },
          { href: "/notifications", label: "Notifications" },
        ],
      },
      {
        label: "Insight",
        items: [
          { href: "/reports", label: "Reports" },
          { href: "/guide", label: "Help" },
        ],
      },
    ],
    ai: [
      { href: "/assistant?q=What%20needs%20my%20attention%20today%3F", label: "What needs me today?" },
      { href: "/cio", label: "Draft an executive brief" },
    ],
  },
  {
    href: "/clients",
    label: "Clients",
    icon: "clients",
    match: ["/clients"],
    sections: [{ label: "Directory", items: [{ href: "/clients", label: "All clients" }] }],
    ai: [
      { href: "/assistant?q=Summarise%20my%20most%20important%20client", label: "Summarise a client" },
      { href: "/comms", label: "Draft a client update" },
    ],
  },
  {
    href: "/projects",
    label: "Projects",
    icon: "projects",
    match: ["/projects", "/boards"],
    sections: [
      {
        label: "Work",
        items: [
          { href: "/projects", label: "All projects" },
          { href: "/projects/breakdown", label: "Task breakdown" },
          { href: "/boards", label: "Boards" },
        ],
      },
    ],
    ai: [
      { href: "/assistant?q=Which%20projects%20are%20at%20risk%3F", label: "Which projects are at risk?" },
      { href: "/ai/automations", label: "Automate kick-offs" },
    ],
  },
  {
    href: "/proposals",
    label: "Proposals",
    icon: "proposals",
    match: ["/proposals"],
    sections: [{ label: "Pipeline", items: [{ href: "/proposals", label: "All proposals" }] }],
    ai: [
      { href: "/ai/skills", label: "Proposal introductions" },
      { href: "/ai/automations", label: "Automate follow-ups" },
    ],
  },
  {
    href: "/finance",
    label: "Finance",
    icon: "finance",
    match: ["/finance", "/invoices", "/expenses"],
    sections: [
      {
        label: "Transactions",
        items: [
          { href: "/finance", label: "Overview" },
          { href: "/invoices", label: "Invoices" },
          { href: "/expenses", label: "Expenses" },
          { href: "/invoices/new", label: "New invoice" },
        ],
      },
    ],
    ai: [
      { href: "/assistant?q=Which%20invoices%20are%20overdue%3F", label: "Chase an overdue invoice" },
      { href: "/reports", label: "Revenue overview" },
    ],
  },
  {
    href: "/comms",
    label: "Comms",
    icon: "comms",
    match: ["/comms"],
    sections: [{ label: "Conversations", items: [{ href: "/comms", label: "All conversations" }] }],
    ai: [{ href: "/ai/skills", label: "Replying to client email" }],
  },
  {
    href: "/ai/team",
    label: "AI",
    icon: "ai",
    match: ["/ai", "/assistant"],
    sections: [
      { label: "Employees", items: [{ href: "/ai/team", label: "AI team" }] },
      {
        label: "Workflows",
        items: [
          { href: "/ai/automations", label: "Automations" },
          { href: "/ai/skills", label: "Skills library" },
        ],
      },
      { label: "Your team", items: [{ href: "/assistant", label: "Assistant" }] },
    ],
  },
  {
    href: "/cio",
    label: "CIO",
    icon: "cio",
    match: ["/cio", "/decisions"],
    sections: [
      {
        label: "Today",
        items: [
          { href: "/cio", label: "Morning briefing" },
          { href: "/decisions", label: "Decision log" },
        ],
      },
    ],
    ai: [{ href: "/assistant", label: "Ask a follow-up" }],
  },
  {
    href: "/memory",
    label: "Memory",
    icon: "memory",
    match: ["/memory"],
    sections: [
      {
        label: "The memory",
        items: [
          { href: "/memory", label: "Memory score" },
          { href: "/memory/what-we-know", label: "What we know" },
        ],
      },
      {
        label: "Feed it",
        items: [
          { href: "/memory/questions", label: "Answer questions" },
          { href: "/memory/import", label: "Import" },
        ],
      },
    ],
    ai: [{ href: "/assistant", label: "Test the memory" }],
  },
  {
    href: "/documents",
    label: "Docs",
    icon: "docs",
    match: ["/documents"],
    sections: [{ label: "Library", items: [{ href: "/documents", label: "Document hub" }] }],
    ai: [
      { href: "/ai/skills", label: "Draft a document" },
      { href: "/ai/skills", label: "Summarise a document" },
    ],
  },
  {
    href: "/sheets",
    label: "Sheets",
    icon: "sheets",
    match: ["/sheets"],
    sections: [{ label: "Spreadsheets", items: [{ href: "/sheets", label: "All sheets" }] }],
    ai: [{ href: "/ai/skills", label: "Generate a document" }],
  },
  {
    href: "/settings",
    label: "Setup",
    icon: "setup",
    match: ["/settings", "/billing"],
    sections: [
      { label: "People", items: [{ href: "/settings/team", label: "Team directory" }] },
      {
        label: "Workspace",
        items: [
          { href: "/settings", label: "Settings" },
          { href: "/settings/plan", label: "Plan & usage" },
        ],
      },
    ],
  },
];

function inModule(pathname: string, m: RailItem) {
  return m.match.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
export function currentModule(pathname: string): RailItem {
  // Specific match first (e.g. /ai before /assistant ordering is irrelevant), fallback Home.
  return MODULES.find((m) => inModule(pathname, m)) ?? MODULES[0];
}

/** Best title for the top bar: module › page. */
export function pageTitle(pathname: string): { module: string; page: string | null } {
  const mod = currentModule(pathname);
  let best: NavLink | null = null;
  for (const s of mod.sections) {
    for (const i of s.items) {
      const base = i.href.split("?")[0];
      if (pathname === base || pathname.startsWith(base + "/")) {
        if (!best || base.length > best.href.split("?")[0].length) best = i;
      }
    }
  }
  return { module: mod.label, page: best && best.label !== mod.label ? best.label : null };
}

/* ── Rail ───────────────────────────────────────────────────────────────── */

function RailLink({ m, active }: { m: RailItem; active: boolean }) {
  return (
    <Link
      href={m.href}
      title={m.label}
      aria-current={active ? "page" : undefined}
      className={cx(
        "flex w-14 flex-col items-center gap-1 rounded-[var(--radius-control)] px-1 py-2 text-[10px]",
        active ? "bg-brand/15 font-medium text-brand" : "text-muted hover:bg-surface-2 hover:text-text",
      )}
    >
      <span className="h-5 w-5 [&>svg]:h-full [&>svg]:w-full">{RAIL_ICONS[m.icon]}</span>
      {m.label}
    </Link>
  );
}

export function IconRail({ brand = "BizMemory" }: { brand?: string }) {
  const pathname = usePathname();
  const current = currentModule(pathname);
  const main = MODULES.filter((m) => m.label !== "Setup");
  const setup = MODULES.find((m) => m.label === "Setup")!;
  return (
    <nav
      aria-label="Modules"
      className="sticky top-0 flex h-dvh w-16 shrink-0 flex-col items-center gap-1 border-r border-border bg-surface/60 py-3"
    >
      <Link href="/dashboard" title={brand} aria-label={`${brand} home`} className="mb-2 flex h-9 w-9 items-center justify-center rounded-[10px] bg-brand text-sm font-bold text-white">
        B
      </Link>
      <div className="scroll-thin flex w-full flex-1 flex-col items-center gap-1 overflow-y-auto">
        {main.map((m) => (
          <RailLink key={m.href} m={m} active={m.href === current.href} />
        ))}
      </div>
      <RailLink m={setup} active={setup.href === current.href} />
    </nav>
  );
}

/* ── Sub-sidebar ────────────────────────────────────────────────────────── */

const ROLE_LABEL: Record<string, string> = { OWNER: "Owner", ADMIN: "Admin", MANAGER: "Manager", MEMBER: "Member" };

export function ModuleSubnav({
  orgName,
  userName,
  userRole,
  userImage,
  credits,
  dynamic,
}: {
  orgName: string;
  userName: string;
  userRole: string;
  userImage?: string | null;
  credits: { used: number; limit: number; teamNames: string[] };
  dynamic: SubnavData;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [filter, setFilter] = useState("");
  const current = currentModule(pathname);
  const f = filter.trim().toLowerCase();
  const match = (label: string) => !f || label.toLowerCase().includes(f);
  const groups = dynamic[current.label] ?? [];
  const isActive = (href: string) => {
    const base = href.split("?")[0];
    if (pathname === base) return true;
    // Highlight parent link for nested detail routes, unless a more specific sibling matches.
    if (!pathname.startsWith(base + "/")) return false;
    const siblings = current.sections.flatMap((s) => s.items.map((i) => i.href.split("?")[0]));
    return !siblings.some((s) => s.length > base.length && (pathname === s || pathname.startsWith(s + "/")));
  };

  if (collapsed) {
    return (
      <aside className="sticky top-0 hidden h-dvh w-11 shrink-0 flex-col items-center border-r border-border bg-surface/40 py-3 lg:flex">
        <button type="button" aria-label="Expand panel" onClick={() => setCollapsed(false)} className="rounded p-1.5 text-muted hover:bg-surface-2 hover:text-text">
          <Icon name="chevronRight" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-surface/40 lg:flex">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <span className="truncate font-semibold tracking-tight">{current.label}</span>
        <button type="button" aria-label="Collapse panel" onClick={() => setCollapsed(true)} className="rounded p-1 text-muted hover:bg-surface-2 hover:text-text">
          <Icon name="chevronLeft" />
        </button>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-3">
        <div className="relative mb-4">
          <Icon name="search" className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={`Filter in ${current.label}`}
            aria-label={`Filter in ${current.label}`}
            className="w-full rounded-[var(--radius-control)] border border-border bg-surface-2 py-1.5 pl-8 pr-3 text-xs text-text placeholder:text-muted/60 focus:border-brand focus:outline-none"
          />
        </div>

        {current.sections.map((section) => {
          const items = section.items.filter((i) => match(i.label));
          if (!items.length) return null;
          return (
            <div key={section.label} className="mb-4">
              <div className="px-2 pb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">{section.label}</div>
              {items.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.label + item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "block rounded-[var(--radius-control)] px-3 py-1.5 text-sm",
                      active ? "bg-brand/15 font-medium text-brand" : "text-muted hover:bg-surface-2 hover:text-text",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          );
        })}

        {groups.map((g) => {
          const items = g.items.filter((i) => match(i.label));
          if (!items.length) return null;
          return (
            <div key={g.heading} className="mb-4">
              <div className="px-2 pb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">{g.heading}</div>
              {items.map((i) => (
                <Link
                  key={i.href + i.label}
                  href={i.href}
                  className={cx(
                    "flex items-center justify-between gap-2 rounded-[var(--radius-control)] px-3 py-1.5 text-sm",
                    pathname === i.href ? "bg-brand/15 font-medium text-brand" : "text-muted hover:bg-surface-2 hover:text-text",
                  )}
                >
                  <span className="truncate">{i.label}</span>
                  {i.meta ? <span className="shrink-0 text-[10px] text-muted/80">{i.meta}</span> : null}
                </Link>
              ))}
            </div>
          );
        })}

        {current.ai && current.ai.length > 0 ? (
          <div className="mt-2 rounded-[var(--radius-control)] border border-brand/30 bg-brand/5 p-3">
            <div className="pb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-brand">AI in this domain</div>
            {current.ai.map((a) => (
              <Link key={a.label + a.href} href={a.href} className="flex items-center gap-1.5 rounded-[var(--radius-control)] px-2 py-1.5 text-sm text-brand hover:bg-brand/10">
                <Icon name="sparkle" className="h-3.5 w-3.5 shrink-0" />
                <span>{a.label}</span>
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      <div className="shrink-0">
        <AiCreditsMeter used={credits.used} limit={credits.limit} teamNames={credits.teamNames} />
        <FocusTimer />
        <UserCard name={userName} role={ROLE_LABEL[userRole] ?? userRole} image={userImage} orgName={orgName} />
      </div>
    </aside>
  );
}

export function UserCard({ name, role, image, orgName }: { name: string; role: string; image?: string | null; orgName: string }) {
  return (
    <div className="flex items-center gap-2.5 border-t border-border p-3">
      <Avatar name={name} src={image} />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-sm font-medium" title={name}>{name}</div>
        <div className="truncate text-[11px] text-muted" title={orgName}>{role} · {orgName}</div>
      </div>
      <form action={signOutAction}>
        <button type="submit" aria-label="Sign out" title="Sign out" className="rounded p-1.5 text-muted hover:bg-surface-2 hover:text-text">
          <Icon name="logout" />
        </button>
      </form>
    </div>
  );
}

export function AiCreditsMeter({ used, limit, teamNames }: { used: number; limit: number; teamNames: string[] }) {
  const pct = Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  return (
    <div className="border-t border-border p-3">
      <div className="flex items-center justify-between font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
        <span>AI credits</span>
        <span>{used}/{limit}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${pct}%` }} role="progressbar" aria-valuenow={used} aria-valuemin={0} aria-valuemax={limit} aria-label="AI credits used" />
      </div>
      {teamNames.length > 0 ? <div className="mt-1.5 text-[10px] text-muted">{teamNames.join(", ")} on duty</div> : null}
      <Link href="/ai/team" className="mt-1 inline-block text-[10px] text-brand hover:underline">See what they went on →</Link>
    </div>
  );
}

const TIMER_MODES = [
  { minutes: 25, label: "Focus" },
  { minutes: 5, label: "Short break" },
  { minutes: 15, label: "Long break" },
] as const;

export function FocusTimer() {
  const [mode, setMode] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const total = TIMER_MODES[mode].minutes * 60;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setRemaining((r) => {
        const next = (r ?? total) - 1;
        if (next <= 0) {
          setRunning(false);
          return null;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running, total]);

  const secs = remaining ?? total;
  const display = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;

  return (
    <div className="border-t border-border p-3">
      <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{TIMER_MODES[mode].label}</div>
      <div className="mt-1 flex items-center justify-between">
        <span className="font-mono text-xl text-text" aria-live="off">{display}</span>
        <button
          type="button"
          onClick={() => {
            if (running) {
              setRunning(false);
              setRemaining(null);
            } else {
              setRunning(true);
            }
          }}
          aria-label={running ? "Stop timer" : "Start timer"}
          className={cx("flex h-8 w-8 items-center justify-center rounded-full", running ? "border border-border text-muted hover:text-text" : "bg-brand text-white hover:bg-brand-strong")}
        >
          <Icon name={running ? "pause" : "play"} className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-2 flex gap-1.5">
        {TIMER_MODES.map((m, i) => (
          <button
            key={m.minutes}
            type="button"
            onClick={() => {
              setMode(i);
              setRemaining(null);
              setRunning(false);
            }}
            className={cx("flex-1 rounded-[var(--radius-control)] px-2 py-1 text-xs", mode === i ? "bg-brand/20 font-medium text-brand" : "bg-surface-2 text-muted hover:text-text")}
          >
            {m.minutes}m
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Top bar ────────────────────────────────────────────────────────────── */

export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("bm-theme");
      if (saved === "light" || saved === "dark") {
        setTheme(saved);
        document.documentElement.dataset.theme = saved;
      }
    } catch {
      /* storage unavailable */
    }
  }, []);
  return (
    <button
      type="button"
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      title="Toggle theme"
      onClick={() => {
        const next = theme === "dark" ? "light" : "dark";
        setTheme(next);
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem("bm-theme", next);
        } catch {
          /* ignore */
        }
      }}
      className="rounded-[var(--radius-control)] border border-border p-2 text-muted hover:border-brand hover:text-text"
    >
      <Icon name={theme === "dark" ? "moon" : "sun"} />
    </button>
  );
}

export function TopBar({ userName, userImage, unread }: { userName: string; userImage?: string | null; unread: number }) {
  const pathname = usePathname();
  const t = pageTitle(pathname);
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-bg/80 px-4 backdrop-blur sm:px-6">
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <span className="font-semibold">{t.module}</span>
        {t.page ? (
          <>
            <Icon name="chevronRight" className="h-3.5 w-3.5 text-muted" />
            <span className="truncate text-muted">{t.page}</span>
          </>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <SearchBar />
        <ThemeToggle />
        <Link href="/notifications" aria-label={unread ? `Notifications (${unread} unread)` : "Notifications"} className="relative rounded-[var(--radius-control)] border border-border p-2 text-muted hover:border-brand hover:text-text">
          <Icon name="bell" />
          {unread > 0 ? <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">{unread > 9 ? "9+" : unread}</span> : null}
        </Link>
        <Link href="/settings" aria-label="Your profile" title={userName}>
          <Avatar name={userName} src={userImage} />
        </Link>
      </div>
    </header>
  );
}

/* ── Floating AI button ─────────────────────────────────────────────────── */

const FAB_PROMPTS = [
  "What needs my attention today?",
  "Which invoices are overdue?",
  "Summarise this week's progress",
  "Draft a follow-up for my newest proposal",
];

export function AiFab() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const router = useRouter();
  const go = (text: string) => {
    if (!text.trim()) return;
    setOpen(false);
    setQ("");
    router.push(`/assistant?q=${encodeURIComponent(text.trim())}`);
  };
  return (
    <>
      {open ? (
        <div role="dialog" aria-label="Ask the assistant" className="fixed bottom-20 right-5 z-40 w-[min(22rem,calc(100vw-2.5rem))] overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Icon name="sparkle" className="h-4 w-4 text-brand" />
              Ask your business
            </div>
            <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="rounded p-1 text-muted hover:bg-surface-2 hover:text-text">
              <Icon name="x" />
            </button>
          </div>
          <div className="space-y-1.5 p-3">
            {FAB_PROMPTS.map((p) => (
              <button key={p} type="button" onClick={() => go(p)} className="block w-full rounded-[var(--radius-control)] border border-border bg-surface-2 px-3 py-2 text-left text-xs text-muted hover:border-brand hover:text-text">
                {p}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              go(q);
            }}
            className="flex gap-2 border-t border-border p-3"
          >
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask anything…" aria-label="Ask anything" className="min-w-0 flex-1 rounded-[var(--radius-control)] border border-border bg-surface-2 px-3 py-2 text-sm focus:border-brand focus:outline-none" />
            <button type="submit" aria-label="Send" className="rounded-[var(--radius-control)] bg-brand px-3 text-white hover:bg-brand-strong">
              <Icon name="send" />
            </button>
          </form>
        </div>
      ) : null}
      <button
        type="button"
        aria-label="Open AI assistant"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-brand text-white shadow-lg hover:bg-brand-strong"
      >
        <Icon name={open ? "x" : "sparkle"} className="h-5 w-5" />
      </button>
    </>
  );
}

/* ── Command palette + search ───────────────────────────────────────────── */

interface PaletteItem {
  label: string;
  href: string;
  module: string;
}

export function CommandPalette({ forceOpen, onClose }: { forceOpen?: boolean; onClose?: () => void } = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const isOpen = forceOpen ?? open;

  const items: PaletteItem[] = useMemo(
    () =>
      MODULES.flatMap((m) => [
        { label: m.label, href: m.href, module: m.label },
        ...m.sections.flatMap((s) => s.items.map((i) => ({ label: `${m.label} › ${i.label}`, href: i.href, module: m.label }))),
      ]),
    [],
  );

  useEffect(() => {
    if (forceOpen) return;
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [forceOpen]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
    else setQuery("");
  }, [isOpen]);

  const filtered = items.filter((i) => i.label.toLowerCase().includes(query.trim().toLowerCase()));
  if (!isOpen) return null;
  const close = () => (onClose ? onClose() : setOpen(false));

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/60 p-4 pt-24" onClick={close} role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="w-full max-w-lg overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Jump to a page…"
          className="w-full border-b border-border bg-transparent px-4 py-3 text-sm text-text placeholder:text-muted/60 focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && filtered.length > 0) {
              router.push(filtered[0].href);
              close();
            }
            if (e.key === "Escape") close();
          }}
        />
        <ul className="max-h-72 overflow-y-auto p-2">
          {filtered.slice(0, 12).map((i) => (
            <li key={i.label}>
              <button
                type="button"
                onClick={() => {
                  router.push(i.href);
                  close();
                }}
                className="flex w-full items-center justify-between rounded-[var(--radius-control)] px-3 py-2 text-left text-sm text-muted hover:bg-surface-2 hover:text-text"
              >
                <span>{i.label}</span>
                <span className="text-[10px] uppercase tracking-wider text-muted/70">{i.module}</span>
              </button>
            </li>
          ))}
          {filtered.length === 0 ? <li className="px-3 py-6 text-center text-sm text-muted">No matches</li> : null}
        </ul>
        <div className="border-t border-border px-4 py-2 text-[10px] text-muted">
          <kbd className="rounded bg-surface-2 px-1.5 py-0.5 font-mono">Ctrl</kbd> <kbd className="rounded bg-surface-2 px-1.5 py-0.5 font-mono">K</kbd> to toggle · Enter opens the first result
        </div>
      </div>
    </div>
  );
}

export function SearchBar() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden items-center gap-2 rounded-[var(--radius-control)] border border-border bg-surface-2 px-3 py-1.5 text-xs text-muted hover:border-brand sm:flex"
        aria-label="Search (Ctrl+K)"
      >
        <Icon name="search" className="h-3.5 w-3.5" />
        Search…
        <kbd className="rounded bg-surface px-1.5 py-0.5 font-mono text-[10px]">Ctrl K</kbd>
      </button>
      {open ? <CommandPalette forceOpen onClose={() => setOpen(false)} /> : null}
    </>
  );
}
