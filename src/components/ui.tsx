import Link from "next/link";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* ── Buttons ─────────────────────────────────────────────────────────────── */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const buttonBase =
  "inline-flex min-h-9 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] border px-3.5 py-1.5 text-sm font-medium transition-colors duration-[var(--duration-fast)] disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-2 disabled:text-muted";

const buttonStyles: Record<ButtonVariant, string> = {
  primary: "border-transparent bg-brand text-on-brand hover:bg-brand-strong",
  secondary: "border-border-strong bg-surface text-text hover:bg-surface-2",
  ghost: "border-transparent bg-transparent text-text-2 hover:bg-surface-2 hover:text-text",
  danger: "border-danger/60 bg-transparent text-danger hover:bg-danger-soft",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button className={cx(buttonBase, buttonStyles[variant], className)} {...props} />;
}

export function ButtonLink({
  href,
  variant = "primary",
  className,
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={cx(buttonBase, buttonStyles[variant], "min-h-11 sm:min-h-9", className)}>
      {children}
    </Link>
  );
}

/* ── Surfaces ────────────────────────────────────────────────────────────── */

export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cx(
        "rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-lg font-semibold text-text">{children}</h2>;
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted">{label}</span>
      <span className="num text-xl font-semibold">{value}</span>
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </Card>
  );
}

const badgeTones = {
  neutral: { chip: "bg-surface-2 text-text-2", dot: "bg-muted" },
  success: { chip: "bg-success-soft text-success", dot: "bg-success" },
  warn: { chip: "bg-warn-soft text-warn", dot: "bg-warn" },
  danger: { chip: "bg-danger-soft text-danger", dot: "bg-danger" },
  brand: { chip: "bg-brand-soft text-brand", dot: "bg-brand" },
} as const;

/** Status chip: tinted fill + leading dot, so meaning never rests on colour alone. */
export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: keyof typeof badgeTones;
  children: ReactNode;
}) {
  const t = badgeTones[tone];
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-badge)] px-2 py-0.5 text-xs font-medium",
        t.chip,
      )}
    >
      <span aria-hidden className={cx("h-1.5 w-1.5 shrink-0 rounded-full", t.dot)} />
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface px-5 py-6">
      <p className="text-sm font-medium text-text">{title}</p>
      {hint ? <p className="mt-1 max-w-prose text-sm text-muted">{hint}</p> : null}
    </div>
  );
}

/* ── Form controls ───────────────────────────────────────────────────────── */

const fieldStyles =
  "w-full min-h-9 rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 py-1.5 text-sm text-text transition-colors duration-[var(--duration-fast)] hover:border-text-2 focus:border-brand disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted aria-[invalid=true]:border-danger";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(fieldStyles, props.className)} {...props} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(fieldStyles, props.className)} {...props} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(fieldStyles, "min-h-24 py-2", props.className)} {...props} />;
}

/** Visible label above the control; optional helper text and inline error beneath. */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-text-2">{label}</span>
      {children}
      {error ? (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : hint ? (
        <span className="text-xs text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

/* ── Tables ──────────────────────────────────────────────────────────────── */

/**
 * Data table: column headers on a tinted bar that stays visible while a long
 * list scrolls (desktop), first column pinned when the table scrolls sideways
 * (mobile), tabular figures from the global table rule. `align` right-aligns
 * numeric columns (header and cells must match).
 */
export function Table({
  head,
  align,
  children,
}: {
  head: string[];
  align?: Array<"left" | "right" | "center" | undefined>;
  children: ReactNode;
}) {
  return (
    <div className="data-table overflow-x-auto rounded-[var(--radius-card)] border border-border bg-surface lg:max-h-[calc(100dvh-13rem)] lg:overflow-y-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th
                key={h + i}
                scope="col"
                className={cx(
                  "sticky top-0 z-10 whitespace-nowrap border-b border-border bg-surface-2 px-4 py-2.5 text-xs font-medium text-muted",
                  align?.[i] === "right" && "text-right",
                  align?.[i] === "center" && "text-center",
                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}
