import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cx } from "@/components/ui";

// Same look as the shared form controls, but className MERGES instead of replacing.
const base =
  "w-full rounded-[var(--radius-control)] border border-border bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-muted/60 focus:border-brand focus:outline-none";

export function Input({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(base, className)} {...p} />;
}
export function Select({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(base, className)} {...p} />;
}
export function Textarea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(base, "min-h-24", className)} {...p} />;
}

/** Toggle chips for choosing AI teammates. Posts one `emp` value per checked chip. */
export function EmployeeChips({
  employees,
  defaultKeys = [],
  name = "emp",
}: {
  employees: Array<{ key: string; name: string; role?: string }>;
  defaultKeys?: string[];
  name?: string;
}) {
  const on = new Set(defaultKeys);
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="AI teammates">
      {employees.map((e) => (
        <label
          key={e.key}
          className={cx(
            "inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1 text-xs text-muted transition-colors hover:text-text",
            "has-[:checked]:border-brand has-[:checked]:bg-brand/15 has-[:checked]:text-brand",
            "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/50",
          )}
        >
          <input type="checkbox" name={name} value={e.key} defaultChecked={on.has(e.key)} className="sr-only" />
          <span className="font-medium">{e.name}</span>
          {e.role ? <span className="opacity-70">{e.role}</span> : null}
        </label>
      ))}
    </div>
  );
}

export function FieldLabel({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-3">
      <span className="text-xs font-medium text-muted">{children}</span>
      {hint ? <span className="text-[11px] text-muted/70">{hint}</span> : null}
    </div>
  );
}
