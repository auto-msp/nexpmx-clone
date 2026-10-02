"use client";

import { useRef, useState } from "react";
import { ActionForm, RichTextEditor } from "@/components/kit-client";
import { Button, Field, Input, Select } from "@/components/ui";
import { Icon } from "@/components/kit-icons";
import { formatPaise } from "@/lib/gst";
import type { ActionResult } from "@/lib/action";

interface Row {
  key: number;
  description: string;
  quantity: string;
  rate: string; // rupees as typed
}

export interface ProposalFormInitial {
  id?: string;
  clientId?: string;
  title?: string;
  summary?: string;
  bodyHtml?: string;
  validUntil?: string;
  advancePct?: number;
  items?: Array<{ description: string; quantity: number; rateMinor: number }>;
}

export function ProposalForm({
  action,
  clients,
  initial,
  submitLabel,
}: {
  action: (fd: FormData) => Promise<ActionResult>;
  clients: Array<{ id: string; name: string }>;
  initial?: ProposalFormInitial;
  submitLabel: string;
}) {
  const seq = useRef(0);
  const mk = (description = "", quantity = "1", rate = ""): Row => ({ key: ++seq.current, description, quantity, rate });
  const [rows, setRows] = useState<Row[]>(() =>
    initial?.items && initial.items.length > 0
      ? initial.items.map((i) => mk(i.description, String(i.quantity), i.rateMinor ? String(i.rateMinor / 100) : ""))
      : [mk()],
  );

  const parsed = rows.map((r) => ({
    description: r.description.trim(),
    quantity: parseFloat(r.quantity) || 0,
    rateMinor: Math.max(0, Math.round((parseFloat(r.rate) || 0) * 100)),
  }));
  const kept = parsed.filter((r) => r.description || r.rateMinor > 0);
  const total = kept.reduce((s, r) => s + Math.round(r.quantity * r.rateMinor), 0);

  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <ActionForm action={action} submitLabel={submitLabel} resetOnSuccess={false} footerClassName="border-t border-border pt-4">
      {initial?.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      <input type="hidden" name="lineItemsJson" value={JSON.stringify(kept)} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Client">
          <Select name="clientId" required defaultValue={initial?.clientId ?? ""}>
            <option value="" disabled>
              Select client…
            </option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Title">
          <Input name="title" required maxLength={200} placeholder="e.g. Website redesign proposal" defaultValue={initial?.title ?? ""} />
        </Field>
      </div>

      <Field label="Summary (optional)">
        <Input name="summary" maxLength={300} placeholder="One line shown above the document" defaultValue={initial?.summary ?? ""} />
      </Field>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted">Proposal</span>
        <RichTextEditor name="bodyHtml" defaultValue={initial?.bodyHtml ?? ""} placeholder="Scope, approach, timeline, terms…" />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-muted">Scope and line items</span>
        <div className="hidden grid-cols-[1fr_5rem_8rem_2rem] gap-2 px-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted sm:grid">
          <span>Deliverable</span>
          <span>Qty</span>
          <span>Rate (₹)</span>
          <span />
        </div>
        {rows.map((r, i) => (
          <div key={r.key} className="grid grid-cols-[1fr_5rem] items-center gap-2 sm:grid-cols-[1fr_5rem_8rem_2rem]">
            <Input
              aria-label={`Deliverable ${i + 1}`}
              placeholder="Deliverable"
              value={r.description}
              maxLength={300}
              onChange={(e) => update(r.key, { description: e.target.value })}
              className="col-span-2 sm:col-span-1"
            />
            <Input aria-label={`Quantity ${i + 1}`} type="number" min="0" step="any" value={r.quantity} onChange={(e) => update(r.key, { quantity: e.target.value })} />
            <Input aria-label={`Rate in rupees ${i + 1}`} type="number" min="0" step="any" placeholder="0" value={r.rate} onChange={(e) => update(r.key, { rate: e.target.value })} />
            <button
              type="button"
              aria-label={`Remove item ${i + 1}`}
              disabled={rows.length === 1}
              onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
              className="rounded p-1.5 text-muted hover:bg-surface-2 hover:text-danger disabled:opacity-30"
            >
              <Icon name="trash" />
            </button>
          </div>
        ))}
        <div>
          <Button type="button" variant="secondary" onClick={() => setRows((rs) => [...rs, mk()])}>
            <Icon name="plus" />
            Add item
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-3">
        <Field label="Advance on acceptance (%)">
          <Input name="advancePct" type="number" min="0" max="100" step="1" defaultValue={initial?.advancePct ?? 30} />
        </Field>
        <Field label="Valid until (optional)">
          <Input name="validUntil" type="date" defaultValue={initial?.validUntil ?? ""} />
        </Field>
        <div className="rounded-[var(--radius-control)] border border-border bg-surface-2 px-3 py-2 text-right">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Subtotal</div>
          <div className="text-lg font-semibold" aria-live="polite">
            {formatPaise(total)}
          </div>
        </div>
      </div>

    </ActionForm>
  );
}
