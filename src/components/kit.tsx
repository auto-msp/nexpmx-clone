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
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {back ? (
          <Link href={back.href} className="-ml-1 mb-1 inline-flex min-h-8 items-center gap-1 rounded px-1 text-sm text-muted hover:text-text max-md:min-h-11">
            <Icon name="chevronLeft" className="h-4 w-4" />
            {back.label}
          </Link>
        ) : null}
        {eyebrow ? <div className="mb-0.5 text-xs font-medium text-muted">{eyebrow}</div> : null}
        <h1 className="text-xl text-text sm:text-2xl">{title}</h1>
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
        "-mx-2 flex h-full flex-col gap-0.5 rounded-[var(--radius-control)] px-2 py-2.5",
        href && "transition-colors hover:bg-surface-2",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted">{label}</span>
        {icon ? <Icon name={icon} className="h-4 w-4 text-muted" /> : null}
      </div>
      <span className={cx("num text-xl font-semibold sm:text-2xl", toneText[tone])}>{value}</span>
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

export function KpiGrid({ children, cols = 4 }: { children: ReactNode; cols?: 2 | 3 | 4 | 5 | 6 }) {
  const c = {
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-3",
    4: "lg:grid-cols-4",
    5: "sm:grid-cols-3 lg:grid-cols-5",
    6: "sm:grid-cols-3 lg:grid-cols-6",
  }[cols];
  // A ruled summary strip, not a row of cards: hairline above and below, tiles separated by space.
  return <div className={cx("mb-6 grid grid-cols-2 gap-x-6 gap-y-1 border-y border-border py-2", c)}>{children}</div>;
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
        <header className="flex min-h-12 items-center justify-between gap-3 border-b border-border px-4 py-2.5 sm:px-5">
          <h2 className="text-sm font-semibold text-text">{title}</h2>
          {action}
        </header>
      ) : null}
      <div className={flush ? "" : "p-4 sm:p-5"}>{children}</div>
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
    <nav className="scroll-thin -mx-1 mb-5 flex gap-1 overflow-x-auto border-b border-border px-1" aria-label="Sections">
      {tabs.map((t) => (
        <Link
          key={t.href + t.label}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={cx(
            "-mb-px inline-flex min-h-10 shrink-0 items-center whitespace-nowrap border-b-2 px-3 text-sm max-md:min-h-11",
            t.active ? "border-brand font-medium text-text" : "border-transparent text-muted hover:border-border-strong hover:text-text",
          )}
        >
          {t.label}
          {t.count !== undefined ? (
            <span className="num ml-1.5 rounded-[var(--radius-badge)] bg-surface-2 px-1.5 py-0.5 text-xs text-muted">{t.count}</span>
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
    <div className="inline-flex max-w-full flex-wrap gap-0.5 rounded-[var(--radius-control)] border border-border bg-surface-2 p-0.5">
      {items.map((i) => (
        <Link
          key={i.href + i.label}
          href={i.href}
          aria-current={i.active ? "page" : undefined}
          className={cx(
            "inline-flex min-h-8 items-center rounded-[4px] px-3 text-sm font-medium max-md:min-h-11",
            i.active ? "bg-surface text-text shadow-[0_0_0_1px_var(--color-border-strong)]" : "text-muted hover:text-text",
          )}
        >
          {i.label}
        </Link>
      ))}
    </div>
  );
}

export function Avatar({ name, size = "md", src }: { name: string | null | undefined; size?: "sm" | "md" | "lg"; src?: string | null }) {
  const dim = { sm: "h-6 w-6 text-xs", md: "h-8 w-8 text-xs", lg: "h-12 w-12 text-sm" }[size];
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className={cx("shrink-0 rounded-full object-cover", dim)} />;
  }
  return (
    <span
      aria-hidden
      className={cx("inline-flex shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 font-medium text-text-2", dim)}
    >
      {initials(name)}
    </span>
  );
}

export function ProgressBar({ value, max = 100, tone = "brand", label = "Progress" }: { value: number; max?: number; tone?: "brand" | "success" | "warn" | "danger"; label?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round((value / Math.max(1, max)) * 100)));
  const bar = { brand: "bg-brand", success: "bg-success", warn: "bg-warn", danger: "bg-danger" }[tone];
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-border" role="progressbar" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
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
    <div className="flex flex-col items-start gap-3 rounded-[var(--radius-card)] border border-border bg-surface px-5 py-6 sm:flex-row sm:items-center">
      <Icon name={icon} className="h-5 w-5 shrink-0 text-muted" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text">{title}</p>
        {hint ? <p className="mt-0.5 max-w-prose text-sm text-muted">{hint}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/** Label/value row for detail panels. */
export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(6rem,9rem)_1fr] items-start gap-4 border-b border-border py-2 text-sm last:border-b-0">
      <span className="text-muted">{label}</span>
      <span className="min-w-0 break-words text-text">{children ?? "—"}</span>
    </div>
  );
}

/** Two-column responsive form grid. */
export function FormGrid({ children, cols = 2 }: { children: ReactNode; cols?: 1 | 2 | 3 }) {
  const c = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3" }[cols];
  return <div className={cx("grid grid-cols-1 gap-3", c)}>{children}</div>;
}

/** Form section heading ("Company info", "Billing"). */
export function FormSection({ children }: { children: ReactNode }) {
  return (
    <div className="border-b border-border pb-1.5 pt-2 text-sm font-semibold text-text">
      {children}
    </div>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "brand" }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-[var(--radius-badge)] px-2 py-0.5 text-xs",
        tone === "brand" ? "bg-brand-soft text-brand" : "bg-surface-2 text-text-2",
      )}
    >
      {children}
    </span>
  );
}
