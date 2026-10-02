"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/action";
import { cx } from "@/components/ui";
import { TASK_STATUSES, TASK_STATUS_LABEL } from "@/components/home/task-meta";

/** Compact status dropdown that saves immediately. */
export function StatusSelect({
  id,
  status,
  action,
  disabled,
}: {
  id: string;
  status: string;
  action: (fd: FormData) => Promise<ActionResult>;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState(status);

  return (
    <span className="inline-flex flex-col">
      <select
        aria-label="Task status"
        value={value}
        disabled={disabled || pending}
        onChange={(e) => {
          const next = e.target.value;
          const prev = value;
          setValue(next);
          setError(null);
          const fd = new FormData();
          fd.set("id", id);
          fd.set("status", next);
          start(async () => {
            const r = await action(fd).catch(() => ({ ok: false as const, error: "Request failed" }));
            if (!r.ok) {
              setValue(prev);
              setError(r.error);
            } else router.refresh();
          });
        }}
        className={cx(
          "rounded-[var(--radius-control)] border border-border bg-surface-2 px-2 py-1 text-xs text-text focus:border-brand focus:outline-none disabled:opacity-60",
          value === "DONE" && "text-success",
        )}
      >
        {TASK_STATUSES.map((s) => (
          <option key={s} value={s}>
            {TASK_STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      {error ? <span className="mt-1 text-[11px] text-danger">{error}</span> : null}
    </span>
  );
}
