"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { signOutAction } from "@/app/actions/auth";

/**
 * App shell, restructured from screenshot evidence (authorized surface,
 * 2026-10-02): a left icon rail of modules (Home, Clients, Projects,
 * Proposals, Finance, Comms, AI, CIO, Memory, Docs, Sheets, Setup), a
 * per-module sub-panel with contextual sections, an "AI in this domain"
 * quick-action block, an AI credits meter, a focus timer, and a global
 * Ctrl+K command palette in the header. All labels/copy are original.
 */

export interface RailItem {
  href: string;
  label: string;
  icon: string; // key into RAIL_ICONS
  /** Sections shown in the sub-panel for this module. */
  sections: Array<{ label: string; items: Array<{ href: string; label: string }> }>;
  /** "AI in this domain" quick actions. */
  ai?: Array<{ href: string; label: string }>;
}

export const RAIL_ICONS: Record<string, React.ReactNode> = {
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" /></svg>
  ),
  clients: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M16 3.5a4 4 0 0 1 0 7" /><path d="M21 21v-2a4 4 0 0 0-3-3.85" /></svg>
  ),
  projects: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /></svg>
  ),
  proposals: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M7 3h8l4 4v14H7z" /><path d="M15 3v4h4" /><path d="M10 12h6M10 16h6" /></svg>
  ),
  finance: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /><path d="M7 15h4" /></svg>
  ),
  comms: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5Z" /></svg>
  ),
  ai: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="5" y="7" width="14" height="12" rx="3" /><path d="M12 4v3" /><circle cx="9.5" cy="12.5" r="1" fill="currentColor" /><circle cx="14.5" cy="12.5" r="1" fill="currentColor" /><path d="M9 16.5h6" /></svg>
  ),
  cio: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3l2.5 5.5L20 11l-5.5 2.5L12 19l-2.5-5.5L4 11l5.5-2.5z" /></svg>
  ),
  memory: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10Z" /></svg>
  ),
  docs: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 4h11l5 5v11H4z" /><path d="M15 4v5h5" /></svg>
  ),
  sheets: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M9 9v11M15 9v11" /></svg>
  ),
  setup: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3.2" /><path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M18.5 5.5l-2.1 2.1M7.6 16.4l-2.1 2.1" /></svg>
  ),
};

export const MODULES: RailItem[] = [
  {
    href: "/dashboard",
    label: "Home",
    icon: "home",
    sections: [
      {
        label: "Overview",
        items: [
          { href: "/dashboard", label: "Command center" },
          { href: "/reports", label: "Reports" },
        ],
      },
    ],
    ai: [
      { href: "/assistant", label: "Ask about today" },
      { href: "/cio", label: "Draft an executive brief" },
    ],
  },
  {
    href: "/clients",
    label: "Clients",
    icon: "clients",
    sections: [
      {
        label: "Clients",
        items: [{ href: "/clients", label: "All clients" }],
      },
      {
        label: "Portal",
        items: [{ href: "/clients", label: "Manage from client rows" }],
      },
    ],
    ai: [
      { href: "/assistant?q=clients", label: "Summarise a client" },
      { href: "/comms", label: "Draft a client update" },
    ],
  },
  {
    href: "/projects",
    label: "Projects",
    icon: "projects",
    sections: [
      { label: "Projects", items: [{ href: "/projects", label: "All projects" }] },
    ],
    ai: [
      { href: "/assistant?q=projects", label: "Status of a project" },
      { href: "/ai/automations", label: "Automate kick-offs" },
    ],
  },
  {
    href: "/proposals",
    label: "Proposals",
    icon: "proposals",
    sections: [
      { label: "Pipeline", items: [{ href: "/proposals", label: "All proposals" }] },
    ],
    ai: [
      { href: "/ai/skills", label: "Proposal introductions" },
      { href: "/ai/automations", label: "Automate signing" },
    ],
  },
  {
    href: "/invoices",
    label: "Finance",
    icon: "finance",
    sections: [
      {
        label: "Money",
        items: [
          { href: "/invoices", label: "Invoices" },
          { href: "/billing", label: "Plan & billing" },
        ],
      },
    ],
    ai: [
      { href: "/assistant?q=invoice", label: "Chase an overdue invoice" },
      { href: "/reports", label: "Revenue overview" },
    ],
  },
  {
    href: "/comms",
    label: "Comms",
    icon: "comms",
    sections: [
      { label: "Comms", items: [{ href: "/comms", label: "All conversations" }] },
    ],
    ai: [
      { href: "/ai/skills", label: "Replying to client email" },
    ],
  },
  {
    href: "/ai",
    label: "AI",
    icon: "ai",
    sections: [
      {
        label: "Employees",
        items: [
          { href: "/ai/team", label: "AI team" },
          { href: "/ai/skills", label: "Skills" },
        ],
      },
      {
        label: "Workflows",
        items: [
          { href: "/ai/automations", label: "Automations" },
          { href: "/assistant", label: "Assistant" },
        ],
      },
    ],
  },
  {
    href: "/cio",
    label: "CIO",
    icon: "cio",
    sections: [
      { label: "CIO", items: [{ href: "/cio", label: "Executive brief" }] },
    ],
    ai: [{ href: "/assistant", label: "Ask a follow-up" }],
  },
  {
    href: "/memory",
    label: "Memory",
    icon: "memory",
    sections: [
      {
        label: "Memory",
        items: [
          { href: "/memory", label: "Business memory" },
          { href: "/memory/what-we-know", label: "What we know" },
          { href: "/memory/questions", label: "Memory questions" },
          { href: "/memory/import", label: "Import memory" },
        ],
      },
    ],
    ai: [{ href: "/assistant", label: "Test the memory" }],
  },
  {
    href: "/documents",
    label: "Docs",
    icon: "docs",
    sections: [
      { label: "Library", items: [{ href: "/documents", label: "All documents" }] },
    ],
    ai: [
      { href: "/ai/skills", label: "Draft a document" },
      { href: "/ai/skills", label: "Summarise a document" },
    ],
  },
  {
    href: "/sheets",
    label: "Sheets",
    icon: "sheets",
    sections: [
      { label: "Spreadsheets", items: [{ href: "/sheets", label: "All sheets" }] },
    ],
    ai: [{ href: "/ai/skills", label: "Generate a document" }],
  },
  {
    href: "/settings",
    label: "Setup",
    icon: "setup",
    sections: [
      {
        label: "Workspace",
        items: [
          { href: "/settings", label: "General" },
          { href: "/settings/team", label: "Team directory" },
        ],
      },
      {
        label: "Plan",
        items: [
          { href: "/settings/plan", label: "Plan & usage" },
          { href: "/billing", label: "Billing & checkout" },
        ],
      },
      {
        label: "Company",
        items: [
          { href: "/settings/company", label: "Company & GST" },
          { href: "/settings/notifications", label: "Notifications" },
        ],
      },
      {
        label: "Data",
        items: [
          { href: "/settings/privacy", label: "Data & privacy" },
          { href: "/settings/audit", label: "Audit log" },
        ],
      },
    ],
  },
];

const AI_DOMAIN_DOMAINS = new Set(["/comms", "/documents", "/sheets"]);

export function IconRail() {
  const pathname = usePathname();
  const current =
    MODULES.find((m) => pathname === m.href || pathname.startsWith(m.href + "/")) ??
    (pathname.startsWith("/settings") || pathname.startsWith("/billing")
      ? MODULES.find((m) => m.label === "Setup")!
      : MODULES[0]);

  return (
    <nav
      aria-label="Modules"
      className="flex w-16 shrink-0 flex-col items-center gap-1 border-r border-border bg-surface/60 py-3"
    >
      <div aria-hidden className="mb-2 h-8 w-8 rounded-full bg-brand" />
      {MODULES.map((m) => {
        const active = m.href === current.href;
        return (
          <Link
            key={m.href}
            href={m.href}
            title={m.label}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "flex w-14 flex-col items-center gap-1 rounded-[var(--radius-control)] bg-brand/15 px-1 py-2 text-[10px] font-medium text-brand"
                : "flex w-14 flex-col items-center gap-1 rounded-[var(--radius-control)] px-1 py-2 text-[10px] text-muted hover:bg-surface-2 hover:text-text"
            }
          >
            <span className="h-5 w-5 [&>svg]:h-full [&>svg]:w-full">{RAIL_ICONS[m.icon]}</span>
            {m.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function ModuleSubnav({ orgName }: { orgName: string }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const current =
    MODULES.find((m) => pathname === m.href || pathname.startsWith(m.href + "/")) ??
    (pathname.startsWith("/settings") || pathname.startsWith("/billing")
      ? MODULES.find((m) => m.label === "Setup")!
      : MODULES[0]);
  const showAiBlock = current.ai && AI_DOMAIN_DOMAINS.has(current.href);

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface/40 lg:flex">
      <div className="flex h-14 items-center justify-between border-b border-border px-4">
        <span className="truncate font-semibold tracking-tight">{current.label}</span>
        <button
          type="button"
          aria-label={collapsed ? "Expand panel" : "Collapse panel"}
          onClick={() => setCollapsed((c) => !c)}
          className="rounded p-1 text-muted hover:bg-surface-2 hover:text-text"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d={collapsed ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"} />
          </svg>
        </button>
      </div>
      {!collapsed ? (
        <div className="flex-1 overflow-y-auto p-3">
          <input
            type="text"
            placeholder={`Filter in ${current.label}`}
            aria-label={`Filter in ${current.label}`}
            className="mb-4 w-full rounded-[var(--radius-control)] border border-border bg-surface-2 px-3 py-1.5 text-xs text-text placeholder:text-muted/60 focus:border-brand focus:outline-none"
          />
          {current.sections.map((section) => (
            <div key={section.label} className="mb-4">
              <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted">
                {section.label}
              </div>
              {section.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.label + item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={
                      active
                        ? "block rounded-[var(--radius-control)] bg-brand/15 px-3 py-1.5 text-sm font-medium text-brand"
                        : "block rounded-[var(--radius-control)] px-3 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-text"
                    }
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
          {showAiBlock ? (
            <div className="mt-2 rounded-[var(--radius-control)] border border-brand/30 bg-brand/5 p-3">
              <div className="pb-1 text-[10px] font-semibold uppercase tracking-widest text-brand">
                AI in this domain
              </div>
              {current.ai!.map((a) => (
                <Link
                  key={a.label}
                  href={a.href}
                  className="block rounded-[var(--radius-control)] px-2 py-1.5 text-sm text-brand hover:bg-brand/10"
                >
                  <span aria-hidden className="mr-1">✦</span>
                  {a.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="border-t border-border p-3 text-xs text-muted">
        <div className="truncate" title={orgName}>{orgName}</div>
      </div>
    </aside>
  );
}

export function AiCreditsMeter({
  used,
  limit,
  teamNames,
}: {
  used: number;
  limit: number;
  teamNames: string[];
}) {
  const pct = Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  return (
    <div className="border-t border-border p-3">
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-muted">
        <span>AI credits</span>
        <span>
          {used}/{limit}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-brand transition-[width]"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={used}
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-label="AI credits used"
        />
      </div>
      {teamNames.length > 0 ? (
        <div className="mt-2 text-[10px] text-muted">
          {teamNames.join(", ")} on duty
        </div>
      ) : null}
      <Link href="/ai/team" className="mt-1 inline-block text-[10px] text-brand hover:underline">
        See what they went on →
      </Link>
    </div>
  );
}

export function FocusTimer() {
  const [minutes, setMinutes] = useState(15);
  const [remaining, setRemaining] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (remaining === null) return;
    if (remaining <= 0) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setRemaining(null);
      return;
    }
    intervalRef.current = setInterval(() => {
      setRemaining((r) => (r === null ? null : r - 1));
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [remaining]);

  const mm = remaining === null ? minutes : Math.floor(remaining / 60);
  const ss = remaining === null ? 0 : remaining % 60;
  const display = `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;

  return (
    <div className="border-t border-border p-3">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted">
        Long break
      </div>
      <div className="mt-1 flex items-center justify-between">
        <span className="font-mono text-xl text-text">{display}</span>
        {remaining === null ? (
          <button
            type="button"
            onClick={() => setRemaining(minutes * 60)}
            aria-label="Start focus timer"
            className="rounded-full bg-brand px-3 py-1.5 text-white hover:bg-brand-strong"
          >
            ▶
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setRemaining(null)}
            aria-label="Stop focus timer"
            className="rounded-full border border-border px-3 py-1.5 text-muted hover:text-text"
          >
            ■
          </button>
        )}
      </div>
      <div className="mt-2 flex gap-1.5">
        {[25, 5, 15].map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMinutes(m);
              setRemaining(null);
            }}
            className={
              minutes === m
                ? "flex-1 rounded-[var(--radius-control)] bg-brand/20 px-2 py-1 text-xs font-medium text-brand"
                : "flex-1 rounded-[var(--radius-control)] bg-surface-2 px-2 py-1 text-xs text-muted hover:text-text"
            }
          >
            {m}m
          </button>
        ))}
      </div>
    </div>
  );
}

interface PaletteItem {
  label: string;
  href: string;
  module: string;
}

export function CommandPalette({
  forceOpen,
  onClose,
}: {
  forceOpen?: boolean;
  onClose?: () => void;
} = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const isOpen = forceOpen ?? open;

  const items: PaletteItem[] = useMemo(
    () =>
      MODULES.flatMap((m) => [
        { label: m.label, href: m.href, module: m.label },
        ...m.sections.flatMap((s) =>
          s.items.map((i) => ({ label: `${m.label} › ${i.label}`, href: i.href, module: m.label })),
        ),
      ]),
    [],
  );

  useEffect(() => {
    if (forceOpen) return; // controlled by the SearchBar when forced
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

  const filtered = items.filter((i) =>
    i.label.toLowerCase().includes(query.trim().toLowerCase()),
  );

  if (!isOpen) return null;

  const close = () => {
    if (onClose) onClose();
    else setOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-24"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search pages…"
          className="w-full border-b border-border bg-transparent px-4 py-3 text-sm text-text placeholder:text-muted/60 focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && filtered.length > 0) {
              router.push(filtered[0].href);
              close();
            }
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
          {filtered.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted">No matches</li>
          ) : null}
        </ul>
        <div className="border-t border-border px-4 py-2 text-[10px] text-muted">
          <kbd className="rounded bg-surface-2 px-1.5 py-0.5 font-mono">Ctrl</kbd>{" "}
          <kbd className="rounded bg-surface-2 px-1.5 py-0.5 font-mono">K</kbd> to toggle · Enter to
          open first result
        </div>
      </div>
    </div>
  );
}

export function SearchBar() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden items-center gap-2 rounded-[var(--radius-control)] border border-border bg-surface-2 px-3 py-1.5 text-xs text-muted hover:border-brand sm:flex"
        aria-label="Search (Ctrl+K)"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        Search…
        <kbd className="rounded bg-surface px-1.5 py-0.5 font-mono text-[10px]">Ctrl K</kbd>
      </button>
      {open ? <CommandPalette forceOpen onClose={() => setOpen(false)} /> : null}
    </>
  );
}
