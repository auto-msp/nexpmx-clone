"use client";

import { useEffect, useRef, useState } from "react";
import type { ActionResult } from "@/lib/action";
import { ActionButton, ActionForm, Modal } from "@/components/kit-client";
import { Icon } from "@/components/kit-icons";
import { Badge, Button, cx } from "@/components/ui";
import { SwitchAction } from "@/components/ai/ai-bits";
import { FieldLabel, Input, Textarea } from "@/components/ai/fields";

type Act = (fd: FormData) => Promise<ActionResult>;

export interface BoardMember {
  key: string;
  name: string;
  role: string;
  summary: string;
  instructions: string;
  custom: boolean;
  enabled: boolean;
  creditPrice: number;
  tint: string;
}

function EditEmployee({
  member,
  update,
  remove,
  onClose,
}: {
  member: BoardMember;
  update: Act;
  remove: Act;
  onClose: () => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit ${member.name}`}
      description={member.custom ? "Change how this teammate is described and what it should follow." : "Add your own wording and standing instructions for this teammate."}
    >
      <ActionForm action={update} submitLabel="Save changes">
        <input type="hidden" name="key" value={member.key} />
        {member.custom ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <FieldLabel>Name</FieldLabel>
              <Input name="name" defaultValue={member.name} required maxLength={60} />
            </label>
            <label className="block">
              <FieldLabel>Role title</FieldLabel>
              <Input name="roleTitle" defaultValue={member.role} required maxLength={80} />
            </label>
          </div>
        ) : (
          <p className="text-xs text-muted">
            {member.name} · {member.role}. Names and roles of the built-in team stay fixed.
          </p>
        )}
        <label className="block">
          <FieldLabel hint="Shown on the card">One-line summary</FieldLabel>
          <Input name="summary" defaultValue={member.summary} maxLength={240} required={member.custom} />
        </label>
        <label className="block">
          <FieldLabel hint="Optional">Standing instructions</FieldLabel>
          <Textarea name="instructions" defaultValue={member.instructions} maxLength={4000} placeholder="How should this teammate behave, and what should it always keep in mind?" />
        </label>
      </ActionForm>
      {member.custom ? (
        <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
          <p className="text-xs text-muted">Removing a teammate does not delete work they already drafted.</p>
          <ActionButton action={remove} fields={{ key: member.key }} label="Remove teammate" icon="trash" variant="danger" confirm={`Remove ${member.name} from your AI team?`} />
        </div>
      ) : null}
    </Modal>
  );
}

export function TeamBoard({
  members,
  suggestions,
  canManage,
  canAssign,
  actions,
}: {
  members: BoardMember[];
  suggestions: Record<string, string[]>;
  canManage: boolean;
  canAssign: boolean;
  actions: { toggle: Act; assign: Act; update: Act; remove: Act };
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const current = members.find((m) => m.key === selected) ?? null;
  const editMember = members.find((m) => m.key === editing) ?? null;

  useEffect(() => {
    if (selected) panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selected]);

  const chips = current ? (suggestions[current.custom ? "custom" : current.key] ?? suggestions.custom ?? []) : [];

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {members.map((m) => (
          <article
            key={m.key}
            className={cx(
              "flex flex-col rounded-[var(--radius-card)] border bg-surface p-5",
              selected === m.key ? "border-brand" : "border-border",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span aria-hidden className={cx("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-base font-semibold", m.tint)}>
                  {m.name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <h3 className="truncate font-semibold">{m.name}</h3>
                  <p className="truncate text-xs text-muted">{m.role}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {m.custom ? <Badge tone="brand">Custom</Badge> : null}
                {canManage ? (
                  <button
                    type="button"
                    aria-label={`Edit ${m.name}`}
                    onClick={() => setEditing(m.key)}
                    className="rounded p-1.5 text-muted hover:bg-surface-2 hover:text-text"
                  >
                    <Icon name="edit" />
                  </button>
                ) : null}
              </div>
            </div>

            <p className="mt-3 flex-1 text-sm text-muted">{m.summary}</p>

            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
              <Icon name="check" className="h-3.5 w-3.5 text-success" />
              Results wait for your approval
            </p>
            <p className="mt-1 text-[11px] text-muted/80">
              {m.creditPrice > 0 ? `Uses ${m.creditPrice} AI credits a month while on duty` : "Included with your AI credits"}
            </p>

            <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
              <span className="text-xs text-muted">{m.enabled ? "On duty" : "Off duty"}</span>
              {canManage ? (
                <SwitchAction action={actions.toggle} fields={{ key: m.key }} checked={m.enabled} label={`${m.enabled ? "Switch off" : "Switch on"} ${m.name}`} />
              ) : (
                <Badge tone={m.enabled ? "success" : "neutral"}>{m.enabled ? "On" : "Off"}</Badge>
              )}
            </div>
            {canAssign ? (
              <Button
                type="button"
                className="mt-3 w-full"
                disabled={!m.enabled}
                title={m.enabled ? undefined : `Switch ${m.name} on to assign work`}
                onClick={() => {
                  setSelected(m.key);
                  setText("");
                }}
              >
                Assign a task
              </Button>
            ) : null}
          </article>
        ))}
      </div>

      {current ? (
        <div ref={panelRef} className="mt-5 rounded-[var(--radius-card)] border border-brand/50 bg-surface p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">
              Assign a task to {current.name} <span className="font-normal text-muted">· {current.role}</span>
            </h2>
            <button type="button" aria-label="Close" onClick={() => setSelected(null)} className="rounded p-1 text-muted hover:bg-surface-2 hover:text-text">
              <Icon name="x" />
            </button>
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            {chips.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setText(c)}
                className="rounded-full border border-border bg-surface-2 px-3 py-1 text-left text-xs text-muted hover:border-brand hover:text-text"
              >
                {c}
              </button>
            ))}
          </div>
          <ActionForm
            action={actions.assign}
            submitLabel="Assign task"
            pendingLabel="Drafting…"
            onSuccess={() => setText("")}
            successMessage={`${current.name} is on it. The draft lands in the approval inbox below.`}
          >
            <input type="hidden" name="key" value={current.key} />
            <label className="block">
              <span className="sr-only">Task description</span>
              <Textarea
                name="task"
                value={text}
                onChange={(e) => setText(e.target.value)}
                required
                minLength={5}
                maxLength={1000}
                placeholder="Describe what you want done, in your own words."
                className="min-h-28"
              />
            </label>
          </ActionForm>
        </div>
      ) : null}

      {editMember ? <EditEmployee member={editMember} update={actions.update} remove={actions.remove} onClose={() => setEditing(null)} /> : null}
    </>
  );
}
