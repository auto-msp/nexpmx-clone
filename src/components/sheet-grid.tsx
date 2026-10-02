"use client";

import { useMemo, useRef, useState } from "react";
import {
  GRID_COLS,
  GRID_ROWS,
  cellId,
  colLetter,
  evalCell,
  displayValue,
  type Cells,
} from "@/lib/sheets";

/**
 * Spreadsheet grid editor. Screenshot-evidence structure: title bar with
 * Export/Share, a formatting toolbar (bold/italic/underline, alignment,
 * ₹/% formats, decimals, clear, sort, freeze), a formula bar with fx, and an
 * A–Z × 1–100 grid with per-column filter arrows. Implementation is our own:
 * sparse cell map, small formula set, CSV export. Save posts the JSON to a
 * server action.
 */

export function SheetGrid({
  sheetId,
  title,
  initialCells,
  saveAction,
}: {
  sheetId: string;
  title: string;
  initialCells: Cells;
  saveAction: (formData: FormData) => Promise<void>;
}) {
  const [cells, setCells] = useState<Cells>(initialCells);
  const [active, setActive] = useState("A1");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const activeStyle = cells[active]?.s ?? {};
  const activeRaw = cells[active]?.v ?? "";

  function setCell(id: string, raw: string) {
    setCells((prev) => {
      const next = { ...prev };
      if (raw === "" && !next[id]?.s) delete next[id];
      else next[id] = { ...next[id], v: raw };
      return next;
    });
  }

  function applyStyle(patch: Partial<NonNullable<Cells[string]["s"]>>) {
    setCells((prev) => {
      const next = { ...prev };
      const cur = next[active] ?? {};
      next[active] = { ...cur, s: { ...cur.s, ...patch } };
      return next;
    });
  }

  function clearCell() {
    setCells((prev) => {
      const next = { ...prev };
      delete next[active];
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      const fd = new FormData();
      fd.set("id", sheetId);
      fd.set("cellsJson", JSON.stringify(cells));
      await saveAction(fd);
      setSavedAt(new Date().toLocaleTimeString());
    } finally {
      setSaving(false);
    }
  }

  function exportCsv() {
    const rows: string[] = [];
    for (let r = 0; r < GRID_ROWS; r++) {
      const fields: string[] = [];
      for (let c = 0; c < GRID_COLS; c++) {
        const id = cellId(r, c);
        const raw = cells[id]?.v ?? "";
        const val = displayValue(evalCell(cells, raw), cells[id]?.s);
        fields.push(/[",\n]/.test(val) ? `"${val.replace(/"/g, '""')}"` : val);
      }
      rows.push(fields.join(","));
    }
    while (rows.length && /^,*$/.test(rows[rows.length - 1])) rows.pop();
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9-_]+/gi, "-") || "sheet"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const activeDisplay = useMemo(() => {
    const cell = cells[active];
    return displayValue(evalCell(cells, cell?.v ?? ""), cell?.s);
  }, [cells, active]);

  const usedRows = useMemo(() => {
    let max = 20;
    for (const key of Object.keys(cells)) {
      const r = parseInt(key.replace(/[A-Z]/g, ""), 10);
      if (!Number.isNaN(r) && r > max) max = r;
    }
    return Math.min(GRID_ROWS, max + 5);
  }, [cells]);

  const toolBtn = (on: boolean) =>
    `rounded px-2 py-1 text-xs ${
      on ? "bg-brand/25 text-brand" : "text-muted hover:bg-surface-2 hover:text-text"
    }`;

  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface">
      {/* Title bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">{title}</span>
          {savedAt ? <span className="text-xs text-muted">saved {savedAt}</span> : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportCsv}
            className="rounded-[var(--radius-control)] border border-border px-3 py-1.5 text-xs text-muted hover:border-brand hover:text-text"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-[var(--radius-control)] bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-strong disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border px-3 py-1.5">
        <button type="button" aria-label="Bold" onClick={() => applyStyle({ bold: !activeStyle.bold })} className={toolBtn(Boolean(activeStyle.bold))}>
          <span className="font-bold">B</span>
        </button>
        <button type="button" aria-label="Italic" onClick={() => applyStyle({ italic: !activeStyle.italic })} className={toolBtn(Boolean(activeStyle.italic))}>
          <span className="italic">I</span>
        </button>
        <button type="button" aria-label="Underline" onClick={() => applyStyle({ underline: !activeStyle.underline })} className={toolBtn(Boolean(activeStyle.underline))}>
          <span className="underline">U</span>
        </button>
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        {(["left", "center", "right"] as const).map((a) => (
          <button
            key={a}
            type="button"
            aria-label={`Align ${a}`}
            onClick={() => applyStyle({ align: a })}
            className={toolBtn(activeStyle.align === a)}
          >
            {a === "left" ? "⇤" : a === "center" ? "↔" : "⇥"}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        <button type="button" onClick={() => applyStyle({ format: "inr" })} className={toolBtn(activeStyle.format === "inr")}>₹</button>
        <button type="button" onClick={() => applyStyle({ format: "percent" })} className={toolBtn(activeStyle.format === "percent")}>%</button>
        <button type="button" onClick={() => applyStyle({ format: "number" })} className={toolBtn(activeStyle.format === "number")}>#</button>
        <button type="button" onClick={() => applyStyle({ format: "date" })} className={toolBtn(activeStyle.format === "date")}>date</button>
        <button type="button" onClick={() => applyStyle({ decimals: (activeStyle.decimals ?? 0) === 0 ? 2 : 0 })} className={toolBtn(activeStyle.decimals === 2)}>
          .00
        </button>
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        <button type="button" onClick={clearCell} className={toolBtn(false)}>clear</button>
      </div>

      {/* Formula bar */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <span className="w-14 rounded bg-surface-2 px-2 py-1 text-center font-mono text-xs text-muted">
          {active}
        </span>
        <span aria-hidden className="font-mono text-xs italic text-muted">fx</span>
        <input
          type="text"
          value={editing === active ? draft : activeRaw}
          onChange={(e) => {
            setEditing(active);
            setDraft(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setCell(active, editing === active ? draft : activeRaw);
              setEditing(null);
            }
          }}
          onBlur={() => {
            if (editing === active) {
              setCell(active, draft);
              setEditing(null);
            }
          }}
          placeholder="Enter value or formula… (=SUM(A1:A10))"
          aria-label={`Value for cell ${active}`}
          className="flex-1 rounded-[var(--radius-control)] border border-border bg-surface-2 px-3 py-1.5 font-mono text-xs text-text placeholder:text-muted/60 focus:border-brand focus:outline-none"
        />
        <span className="hidden w-32 truncate text-right font-mono text-xs text-muted sm:block" title="Computed value">
          {activeDisplay}
        </span>
      </div>

      {/* Grid */}
      <div ref={gridRef} className="max-h-[60vh] overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-surface">
            <tr>
              <th className="w-10 border-b border-r border-border bg-surface-2/60 px-1 py-1 text-[10px] font-normal text-muted" />
              {Array.from({ length: GRID_COLS }, (_, c) => (
                <th
                  key={c}
                  className="border-b border-r border-border bg-surface-2/60 px-1 py-1 text-[10px] font-medium text-muted"
                >
                  {colLetter(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: usedRows }, (_, r) => (
              <tr key={r}>
                <td className="border-b border-r border-border bg-surface-2/60 px-1 py-0.5 text-center text-[10px] text-muted">
                  {r + 1}
                </td>
                {Array.from({ length: GRID_COLS }, (_, c) => {
                  const id = cellId(r, c);
                  const cell = cells[id];
                  const computed = displayValue(evalCell(cells, cell?.v ?? ""), cell?.s);
                  const isActive = id === active;
                  return (
                    <td
                      key={c}
                      onClick={() => {
                        if (editing && editing !== id) {
                          setCell(editing, draft);
                          setEditing(null);
                        }
                        setActive(id);
                      }}
                      onDoubleClick={() => {
                        setActive(id);
                        setEditing(id);
                        setDraft(cell?.v ?? "");
                      }}
                      className={
                        "cursor-cell border-b border-r border-border px-1.5 py-0.5 " +
                        (isActive ? "outline outline-1 -outline-offset-1 outline-brand" : "") +
                        (cell?.s?.bold ? " font-bold " : "") +
                        (cell?.s?.italic ? " italic " : "") +
                        (cell?.s?.underline ? " underline " : "")
                      }
                      style={{ textAlign: cell?.s?.align ?? "left" }}
                    >
                      {editing === id ? (
                        <input
                          autoFocus
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onBlur={() => {
                            setCell(id, draft);
                            setEditing(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              setCell(id, draft);
                              setEditing(null);
                            }
                            if (e.key === "Escape") setEditing(null);
                          }}
                          className="w-full bg-transparent font-mono text-xs text-text focus:outline-none"
                        />
                      ) : (
                        <span className="block truncate font-mono text-text">{computed}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
