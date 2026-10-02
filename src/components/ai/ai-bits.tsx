"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/action";
import { Button, cx } from "@/components/ui";

type Act = (fd: FormData) => Promise<ActionResult>;

function runOnce(action: Act, fields: Record<string, string>): Promise<ActionResult> {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return action(fd).catch(() => ({ ok: false as const, error: "Could not reach the server. Try again." }));
}

/** Accessible on/off switch that runs a server action. */
export function SwitchAction({
  action,
  fields,
  checked,
  label,
  disabled,
}: {
  action: Act;
  fields: Record<string, string>;
  checked: boolean;
  label: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [on, setOn] = useState(checked);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setOn(checked), [checked]);
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        title={label}
        disabled={pending || disabled}
        onClick={() => {
          setError(null);
          setOn(!on);
          start(async () => {
            const r = await runOnce(action, fields);
            if (!r.ok) {
              setOn(on);
              setError(r.error);
              return;
            }
            router.refresh();
          });
        }}
        className={cx(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          on ? "border-brand bg-brand" : "border-border bg-surface-2",
        )}
      >
        <span
          aria-hidden
          className={cx("absolute h-3.5 w-3.5 rounded-full bg-white shadow transition-all", on ? "left-[18px]" : "left-0.5")}
        />
      </button>
      {error ? <span className="mt-1 max-w-[16rem] text-right text-[11px] text-danger">{error}</span> : null}
    </span>
  );
}

/** Full-width one-click action button (e.g. "+ Add"). */
export function WideActionButton({
  action,
  fields,
  label,
  doneLabel,
  done,
  disabled,
}: {
  action: Act;
  fields: Record<string, string>;
  label: string;
  doneLabel?: string;
  done?: boolean;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="w-full">
      <Button
        type="button"
        variant={done ? "secondary" : "primary"}
        className="w-full"
        disabled={pending || done || disabled}
        onClick={() => {
          setError(null);
          start(async () => {
            const r = await runOnce(action, fields);
            if (!r.ok) setError(r.error);
            else router.refresh();
          });
        }}
      >
        {done ? (doneLabel ?? "Added") : pending ? "Working…" : label}
      </Button>
      {error ? (
        <p role="alert" className="mt-1.5 text-[11px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const SCOPE_HELP: Record<string, string> = {
  ALL: "Applies everywhere, for every client.",
  CLIENT: "Applies only to the client you choose.",
  PROJECT: "Applies only to the project you choose.",
};

/** Everything / One client / One project segmented control with the matching select. */
export function ScopePicker({
  clients,
  projects,
  scopeName = "scope",
  clientName = "clientId",
  projectName = "projectId",
  defaultScope = "ALL",
  defaultClientId = "",
  defaultProjectId = "",
  labels = { ALL: "Everything", CLIENT: "One client", PROJECT: "One project" },
  helpAll,
}: {
  clients: Array<{ id: string; name: string }>;
  projects: Array<{ id: string; name: string }>;
  scopeName?: string;
  clientName?: string;
  projectName?: string;
  defaultScope?: string;
  defaultClientId?: string;
  defaultProjectId?: string;
  labels?: { ALL: string; CLIENT: string; PROJECT: string };
  helpAll?: string;
}) {
  const [scope, setScope] = useState(defaultScope);
  const select =
    "w-full rounded-[var(--radius-control)] border border-border bg-surface-2 px-3 py-2 text-sm text-text focus:border-brand focus:outline-none";
  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" className="inline-flex w-full flex-wrap gap-1 rounded-full border border-border bg-surface-2 p-1 sm:w-auto sm:self-start">
        {(["ALL", "CLIENT", "PROJECT"] as const).map((s) => (
          <label
            key={s}
            className={cx(
              "cursor-pointer rounded-full px-3 py-1 text-xs font-medium",
              scope === s ? "bg-brand text-white" : "text-muted hover:text-text",
            )}
          >
            <input type="radio" name={scopeName} value={s} checked={scope === s} onChange={() => setScope(s)} className="sr-only" />
            {labels[s]}
          </label>
        ))}
      </div>
      {scope === "CLIENT" ? (
        <select name={clientName} defaultValue={defaultClientId} required aria-label="Client" className={select}>
          <option value="">Choose a client…</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      ) : null}
      {scope === "PROJECT" ? (
        <select name={projectName} defaultValue={defaultProjectId} required aria-label="Project" className={select}>
          <option value="">Choose a project…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      ) : null}
      <p className="text-[11px] text-muted">{scope === "ALL" && helpAll ? helpAll : SCOPE_HELP[scope]}</p>
    </div>
  );
}
