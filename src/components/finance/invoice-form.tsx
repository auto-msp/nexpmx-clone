"use client";

import { useRef, useState } from "react";
import { ActionForm } from "@/components/kit-client";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { Icon } from "@/components/kit-icons";
import { formatPaise } from "@/lib/gst";
import { invoiceTotals } from "@/components/finance/money";
import { GST_OPTIONS } from "@/components/finance/constants";
import type { ActionResult } from "@/lib/action";

interface Row {
  key: number;
  description: string;
  quantity: string;
  unit: string;
  rate: string;
  gstBps: number;
}

export interface InvoiceFormClient {
  id: string;
  name: string;
  paymentTermsDays: number;
  state: string | null;
}

function iso(d: Date): string {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function InvoiceForm({
  action,
  clients,
  projects,
  orgState,
  defaultGstBps,
  defaults,
  initialClientId,
}: {
  action: (fd: FormData) => Promise<ActionResult>;
  clients: InvoiceFormClient[];
  projects: Array<{ id: string; name: string; clientId: string | null }>;
  orgState: string | null;
  defaultGstBps: number;
  defaults: { notes: string; terms: string; bankDetails: string };
  initialClientId?: string;
}) {
  const seq = useRef(0);
  const mk = (): Row => ({ key: ++seq.current, description: "", quantity: "1", unit: "Piece", rate: "", gstBps: defaultGstBps });
  const today = new Date();
  const startClient = clients.find((c) => c.id === initialClientId);
  const dueFor = (c: InvoiceFormClient | undefined, from: string) => {
    const base = from ? new Date(from + "T00:00:00") : today;
    return iso(new Date(base.getTime() + (c?.paymentTermsDays ?? 15) * 86_400_000));
  };

  const [clientId, setClientId] = useState(startClient?.id ?? "");
  const [projectId, setProjectId] = useState("");
  const [issueDate, setIssueDate] = useState(iso(today));
  const [dueDate, setDueDate] = useState(dueFor(startClient, iso(today)));
  const [dueTouched, setDueTouched] = useState(false);
  const [interstate, setInterstate] = useState(
    Boolean(startClient?.state && orgState && startClient.state.trim().toLowerCase() !== orgState.trim().toLowerCase()),
  );
  const [interTouched, setInterTouched] = useState(false);
  const [place, setPlace] = useState(startClient?.state ?? "");
  const [rows, setRows] = useState<Row[]>(() => [mk()]);
  const intentRef = useRef<HTMLInputElement>(null);

  const parsed = rows.map((r) => ({
    description: r.description.trim(),
    quantity: parseFloat(r.quantity) || 0,
    unit: r.unit.trim() || "Piece",
    rateMinor: Math.max(0, Math.round((parseFloat(r.rate) || 0) * 100)),
    gstBps: r.gstBps,
  }));
  const kept = parsed.filter((r) => r.description || r.rateMinor > 0);
  const totals = invoiceTotals(kept, interstate);

  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const onClient = (id: string) => {
    setClientId(id);
    const c = clients.find((x) => x.id === id);
    if (projectId && !projects.some((p) => p.id === projectId && (!p.clientId || p.clientId === id))) setProjectId("");
    if (!dueTouched) setDueDate(dueFor(c, issueDate));
    if (c?.state) {
      setPlace(c.state);
      if (!interTouched && orgState) setInterstate(c.state.trim().toLowerCase() !== orgState.trim().toLowerCase());
    }
  };

  const visibleProjects = projects.filter((p) => !clientId || !p.clientId || p.clientId === clientId);

  return (
    <ActionForm action={action} hideSubmit resetOnSuccess={false} className="gap-6">
      <input type="hidden" name="linesJson" value={JSON.stringify(kept)} />
      <input type="hidden" name="intent" ref={intentRef} defaultValue="draft" />

      <section className="rounded-[var(--radius-card)] border border-border bg-surface p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Client">
            <Select name="clientId" required value={clientId} onChange={(e) => onClient(e.target.value)}>
              <option value="" disabled>
                Select a client
              </option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Issue date">
            <Input
              name="issueDate"
              type="date"
              value={issueDate}
              onChange={(e) => {
                setIssueDate(e.target.value);
                if (!dueTouched) setDueDate(dueFor(clients.find((c) => c.id === clientId), e.target.value));
              }}
            />
          </Field>
          <Field label="Project (optional)">
            <Select name="projectId" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">No project</option>
              {visibleProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Due date">
            <Input
              name="dueDate"
              type="date"
              value={dueDate}
              min={issueDate}
              onChange={(e) => {
                setDueDate(e.target.value);
                setDueTouched(true);
              }}
            />
          </Field>
          <Field label="Place of supply (state)">
            <Input name="placeOfSupply" value={place} maxLength={80} placeholder="e.g. Gujarat" onChange={(e) => setPlace(e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 self-end rounded-[var(--radius-control)] border border-border bg-surface-2 px-3 py-2.5 text-sm">
            <input
              type="checkbox"
              name="interstate"
              checked={interstate}
              onChange={(e) => {
                setInterstate(e.target.checked);
                setInterTouched(true);
              }}
              className="h-4 w-4 accent-[var(--color-brand)]"
            />
            <span>Interstate supply (charge IGST)</span>
          </label>
        </div>
      </section>

      <section className="rounded-[var(--radius-card)] border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold">Line items</h2>
        <div className="hidden grid-cols-[2rem_1fr_5rem_6rem_7rem_5rem_7rem_2rem] gap-2 px-1 pb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted lg:grid">
          <span>#</span>
          <span>Description</span>
          <span>Qty</span>
          <span>Unit</span>
          <span>Rate (₹)</span>
          <span>GST %</span>
          <span className="text-right">Amount</span>
          <span />
        </div>
        <div className="flex flex-col gap-3 lg:gap-2">
          {rows.map((r, i) => {
            const amount = Math.round((parseFloat(r.quantity) || 0) * Math.max(0, Math.round((parseFloat(r.rate) || 0) * 100)));
            return (
              <div
                key={r.key}
                className="grid grid-cols-2 items-center gap-2 rounded-[var(--radius-control)] border border-border p-3 sm:grid-cols-4 lg:grid-cols-[2rem_1fr_5rem_6rem_7rem_5rem_7rem_2rem] lg:border-0 lg:p-0"
              >
                <span className="hidden text-sm text-muted lg:block">{i + 1}</span>
                <Input
                  aria-label={`Description ${i + 1}`}
                  placeholder="Item description"
                  value={r.description}
                  maxLength={300}
                  onChange={(e) => update(r.key, { description: e.target.value })}
                  className="col-span-2 sm:col-span-4 lg:col-span-1"
                />
                <Input aria-label={`Quantity ${i + 1}`} type="number" min="0" step="any" value={r.quantity} onChange={(e) => update(r.key, { quantity: e.target.value })} />
                <Input aria-label={`Unit ${i + 1}`} value={r.unit} maxLength={20} onChange={(e) => update(r.key, { unit: e.target.value })} />
                <Input aria-label={`Rate in rupees ${i + 1}`} type="number" min="0" step="any" placeholder="0" value={r.rate} onChange={(e) => update(r.key, { rate: e.target.value })} />
                <Select aria-label={`GST rate ${i + 1}`} value={r.gstBps} onChange={(e) => update(r.key, { gstBps: Number(e.target.value) })}>
                  {GST_OPTIONS.map((g) => (
                    <option key={g} value={g}>
                      {g / 100}%
                    </option>
                  ))}
                </Select>
                <span className="text-right text-sm font-medium tabular-nums">{formatPaise(amount)}</span>
                <button
                  type="button"
                  aria-label={`Remove line ${i + 1}`}
                  disabled={rows.length === 1}
                  onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                  className="justify-self-end rounded p-1.5 text-muted hover:bg-surface-2 hover:text-danger disabled:opacity-30"
                >
                  <Icon name="trash" />
                </button>
              </div>
            );
          })}
        </div>
        <div className="mt-3">
          <Button type="button" variant="secondary" onClick={() => setRows((rs) => [...rs, mk()])}>
            <Icon name="plus" />
            Add line item
          </Button>
        </div>

        <dl className="mt-5 ml-auto flex w-full max-w-xs flex-col gap-1.5 text-sm" aria-live="polite">
          <div className="flex justify-between">
            <dt className="text-muted">Subtotal</dt>
            <dd className="tabular-nums">{formatPaise(totals.netMinor)}</dd>
          </div>
          {interstate ? (
            <div className="flex justify-between">
              <dt className="text-muted">IGST</dt>
              <dd className="tabular-nums">{formatPaise(totals.igstMinor)}</dd>
            </div>
          ) : (
            <>
              <div className="flex justify-between">
                <dt className="text-muted">CGST</dt>
                <dd className="tabular-nums">{formatPaise(totals.cgstMinor)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">SGST</dt>
                <dd className="tabular-nums">{formatPaise(totals.sgstMinor)}</dd>
              </div>
            </>
          )}
          <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
            <dt>Grand total</dt>
            <dd className="tabular-nums">{formatPaise(totals.grossMinor)}</dd>
          </div>
        </dl>
      </section>

      <section className="grid grid-cols-1 gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-5 sm:grid-cols-2">
        <Field label="Notes (visible to client)">
          <Textarea name="notes" maxLength={2000} placeholder="Anything the client should know" defaultValue={defaults.notes} />
        </Field>
        <Field label="Terms and conditions">
          <Textarea name="terms" maxLength={2000} placeholder="Payment terms, late fees…" defaultValue={defaults.terms} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Bank details">
            <Textarea name="bankDetails" maxLength={1000} placeholder="Account name, number, IFSC…" defaultValue={defaults.bankDetails} />
          </Field>
        </div>
      </section>

      <SubmitRow intentRef={intentRef} />
    </ActionForm>
  );
}

function SubmitRow({ intentRef }: { intentRef: React.RefObject<HTMLInputElement | null> }) {
  const set = (v: string) => {
    if (intentRef.current) intentRef.current.value = v;
  };
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button type="submit" variant="secondary" onClick={() => set("draft")}>
        <Icon name="file" />
        Save as draft
      </Button>
      <Button type="submit" onClick={() => set("send")}>
        <Icon name="send" />
        Save and send
      </Button>
    </div>
  );
}
