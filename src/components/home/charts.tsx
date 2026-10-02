import { cx } from "@/components/ui";

/** Short rupee label from paise: ₹850, ₹12.5k, ₹3.2L, ₹1.4Cr. */
export function compactInr(minor: number): string {
  const r = minor / 100;
  const a = Math.abs(r);
  const sign = r < 0 ? "-" : "";
  const n = (v: number) => String(Math.round(v * 10) / 10);
  if (a >= 1e7) return `${sign}₹${n(a / 1e7)}Cr`;
  if (a >= 1e5) return `${sign}₹${n(a / 1e5)}L`;
  if (a >= 1e3) return `${sign}₹${n(a / 1e3)}k`;
  return `${sign}₹${Math.round(a)}`;
}

export interface BarSeries {
  name: string;
  values: number[];
  /** Tailwind background token class, e.g. "bg-brand" */
  className: string;
}

/**
 * Hand-rolled grouped bar chart (CSS flex, no dependencies). Values are
 * assumed non-negative. `format` renders axis and tooltip values.
 */
export function GroupedBars({
  labels,
  series,
  format = compactInr,
  height = 160,
  ariaLabel,
}: {
  labels: string[];
  series: BarSeries[];
  format?: (n: number) => string;
  height?: number;
  ariaLabel: string;
}) {
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const step = labels.length > 14 ? Math.ceil(labels.length / 12) : 1;
  const hasData = series.some((s) => s.values.some((v) => v > 0));
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        {series.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-1.5 text-xs text-muted">
            <span aria-hidden className={cx("h-2.5 w-2.5 rounded-sm", s.className)} />
            {s.name}
          </span>
        ))}
      </div>
      <div role="img" aria-label={ariaLabel} className="relative" style={{ height }}>
        <div className="absolute inset-x-0 top-0 flex items-center gap-2 text-[10px] text-muted">
          <span className="font-mono">{format(max)}</span>
          <span className="h-px flex-1 border-t border-dashed border-border" />
        </div>
        <div className="absolute inset-x-0 bottom-0 top-4 flex items-end gap-1 border-b border-border">
          {labels.map((label, i) => (
            <div key={`${label}-${i}`} className="flex h-full min-w-0 flex-1 items-end justify-center gap-0.5">
              {series.map((s) => {
                const v = s.values[i] ?? 0;
                const pct = v > 0 ? Math.max(2, (v / max) * 100) : 0;
                return (
                  <div
                    key={s.name}
                    title={`${label} · ${s.name}: ${format(v)}`}
                    className={cx("w-full max-w-5 rounded-t-sm", s.className)}
                    style={{ height: `${pct}%` }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1 flex gap-1">
        {labels.map((label, i) => (
          <span key={`${label}-${i}`} className="min-w-0 flex-1 truncate text-center text-[10px] text-muted">
            {i % step === 0 ? label : ""}
          </span>
        ))}
      </div>
      {!hasData ? <p className="mt-2 text-xs text-muted">No activity in this period yet.</p> : null}
    </div>
  );
}
