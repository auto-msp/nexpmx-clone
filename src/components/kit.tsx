import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/kit-icons";
import { Badge, cx } from "@/components/ui";
import { initials } from "@/lib/format";

/**
 * Server-safe layout primitives shared by every module page.
 * Pair with kit-client.tsx (modals, ActionForm, filters) and ui.tsx.
 */

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
  eyebrow,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
  eyebrow?: string;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {back ? (
          <Link href={back.href} className="mb-1 inline-flex items-center gap-1 text-xs text-muted hover:text-text">
            <Icon name="chevronLeft" className="h-3.5 w-3.5" />
            {back.label}
          </Link>
        ) : null}
        {eyebrow ? (
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-brand">{eyebrow}</div>
        ) : null}
        <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

const toneText: Record<string, string> = {
  neutral: "text-text",
  brand: "text-brand",
  success: "text-success",
  warn: "text-warn",
  danger: "text-danger",
};

export function KpiTile({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
  href,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: string;
  tone?: "neutral" | "brand" | "success" | "warn" | "danger";
  href?: string;
}) {
  const body = (
    <div
      className={cx(
        "flex h-full flex-col gap-1 rounded-[var(--radius-card)] border border-border bg-surface p-4",
        href && "transition-colors hover:border-brand",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</span>
        {icon ? <Icon name={icon} className={cx("h-4 w-4", toneText[tone])} /> : null}
      </div>
      <span className={cx("text-2xl font-semibold tracking-tight", toneText[tone])}>{value}</span>
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function KpiGrid({ children, cols = 4 }: { children: ReactNode; cols?: 2 | 3 | 4 | 5 | 6 }) {
  const c = {
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-2 lg:grid-cols-3",
    4: "sm:grid-cols-2 lg:grid-cols-4",
    5: "sm:grid-cols-3 lg:grid-cols-5",
    6: "sm:grid-cols-3 lg:grid-cols-6",
  }[cols];
  return <div className={cx("mb-6 grid grid-cols-1 gap-3", c)}>{children}</div>;
}

/** Titled surface with optional right-side action. */
export function Panel({
  title,
  action,
  children,
  className,
  flush,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <section className={cx("rounded-[var(--radius-card)] border border-border bg-surface", className)}>
      {title || action ? (
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          {action}
        </header>
      ) : null}
      <div className={flush ? "" : "p-5"}>{children}</div>
    </section>
  );
}

/** Link-based tabs (server rendered; active state passed in). */
export function TabLinks({
  tabs,
}: {
  tabs: Array<{ href: string; label: string; active: boolean; count?: number | string }>;
}) {
  return (
    <nav className="mb-5 flex flex-wrap gap-1 border-b border-border" aria-label="Sections">
      {tabs.map((t) => (
        <Link
          key={t.href + t.label}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={cx(
            "-mb-px border-b-2 px-3 py-2 text-sm",
            t.active ? "border-brand font-medium text-brand" : "border-transparent text-muted hover:text-text",
          )}
        >
          {t.label}
          {t.count !== undefined ? (
            <span className="ml-1.5 rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">{t.count}</span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}

/** Pill-shaped segmented links (period selectors, status filters). */
export function PillTabs({
  items,
}: {
  items: Array<{ href: string; label: string; active: boolean }>;
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-full border border-border bg-surface-2 p-1">
      {items.map((i) => (
        <Link
          key={i.href + i.label}
          href={i.href}
          aria-current={i.active ? "page" : undefined}
          className={cx(
            "rounded-full px-3 py-1 text-xs font-medium",
            i.active ? "bg-brand text-white" : "text-muted hover:text-text",
          )}
        >
          {i.label}
        </Link>
      ))}
    </div>
  );
}

export function Avatar({ name, size = "md", src }: { name: string | null | undefined; size?: "sm" | "md" | "lg"; src?: string | null }) {
  const dim = { sm: "h-6 w-6 text-[10px]", md: "h-8 w-8 text-xs", lg: "h-12 w-12 text-sm" }[size];
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className={cx("shrink-0 rounded-full object-cover", dim)} />;
  }
  return (
    <span
      aria-hidden
      className={cx("inline-flex shrink-0 items-center justify-center rounded-full bg-brand/20 font-semibold text-brand", dim)}
    >
      {initials(name)}
    </span>
  );
}

export function ProgressBar({ value, max = 100, tone = "brand" }: { value: number; max?: number; tone?: "brand" | "success" | "warn" | "danger" }) {
  const pct = Math.max(0, Math.min(100, Math.round((value / Math.max(1, max)) * 100)));
  const bar = { brand: "bg-brand", success: "bg-success", warn: "bg-warn", danger: "bg-danger" }[tone];
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx("h-full rounded-full", bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function HealthBadge({ health }: { health: string }) {
  const map: Record<string, { tone: "success" | "warn" | "danger" | "neutral"; label: string }> = {
    GOOD: { tone: "success", label: "Healthy" },
    ON_TRACK: { tone: "success", label: "On track" },
    WATCH: { tone: "warn", label: "Watch" },
    AT_RISK: { tone: "danger", label: "At risk" },
    OFF_TRACK: { tone: "danger", label: "Off track" },
  };
  const m = map[health] ?? { tone: "neutral" as const, label: health };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

/** Status text → badge tone for common statuses across modules. */
export function StatusBadge({ status }: { status: string }) {
  const s = status.toUpperCase();
  const tone: "success" | "warn" | "danger" | "brand" | "neutral" =
    ["PAID", "DONE", "ACTIVE", "SIGNED", "ACCEPTED", "COMPLETED", "APPROVED"].includes(s) ? "success"
    : ["OVERDUE", "REJECTED", "DECLINED", "CANCELLED", "LOST"].includes(s) ? "danger"
    : ["SENT", "VIEWED", "IN_PROGRESS", "IN_REVIEW", "PLANNING", "PENDING", "ON_HOLD"].includes(s) ? "warn"
    : ["DRAFT", "BACKLOG", "TODO", "ARCHIVED"].includes(s) ? "neutral"
    : "brand";
  return <Badge tone={tone}>{status.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</Badge>;
}

/** Rich empty state with icon and optional call to action. */
export function EmptyPanel({
  icon = "folder",
  title,
  hint,
  action,
}: {
  icon?: string;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-[var(--radius-card)] border border-dashed border-border px-6 py-12 text-center">
      <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-muted">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <p className="text-sm font-medium">{title}</p>
      {hint ? <p className="mt-1 max-w-sm text-xs text-muted">{hint}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** Label/value row for detail panels. */
export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <span className="shrink-0 text-muted">{label}</span>
      <span className="min-w-0 text-right">{children ?? "—"}</span>
    </div>
  );
}

/** Two-column responsive form grid. */
export function FormGrid({ children, cols = 2 }: { children: ReactNode; cols?: 1 | 2 | 3 }) {
  const c = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3" }[cols];
  return <div className={cx("grid grid-cols-1 gap-3", c)}>{children}</div>;
}

/** Mono-caps form section heading ("COMPANY INFO", "BILLING"). */
export function FormSection({ children }: { children: ReactNode }) {
  return (
    <div className="border-b border-border pb-1 pt-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
      {children}
    </div>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "brand" }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px]",
        tone === "brand" ? "bg-brand/15 text-brand" : "bg-surface-2 text-muted",
      )}
    >
      {children}
    </span>
  );
}
