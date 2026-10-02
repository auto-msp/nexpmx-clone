"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/action";
import { TASK_STATUSES, TASK_STATUS_LABEL } from "./constants";

/**
 * Compact status + milestone selects for a task in the breakdown matrix.
 * Each change posts straight to the moveTask action.
 */
export function TaskQuickMove({
  taskId,
  status,
  milestoneId,
  milestones,
  action,
}: {
  taskId: string;
  status: string;
  milestoneId: string | null;
  milestones: Array<{ id: string; name: string }>;
  action: (fd: FormData) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fields: Record<string, string>) => {
    const fd = new FormData();
    fd.set("id", taskId);
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    setError(null);
    start(async () => {
      const r = await action(fd).catch(() => ({ ok: false as const, error: "Request failed" }));
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  };

  const sel =
    "w-full min-w-0 rounded border border-border bg-surface px-1.5 py-1 text-[11px] text-text focus:border-brand focus:outline-none disabled:opacity-60";
  return (
    <div className="mt-1.5 grid grid-cols-2 gap-1">
      <select aria-label="Status" className={sel} value={status} disabled={pending} onChange={(e) => run({ status: e.target.value })}>
        {TASK_STATUSES.map((s) => (
          <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>
        ))}
      </select>
      <select
        aria-label="Milestone"
        className={sel}
        value={milestoneId ?? ""}
        disabled={pending}
        onChange={(e) => run({ milestoneId: e.target.value })}
      >
        <option value="">No milestone</option>
        {milestones.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>
      {error ? <span className="col-span-2 text-[11px] text-danger">{error}</span> : null}
    </div>
  );
}
