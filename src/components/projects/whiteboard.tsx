"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/kit-icons";
import { cx } from "@/components/ui";
import type { ActionResult } from "@/lib/action";
import {
  COLOR_KEYS,
  MAX_CONNECTORS,
  MAX_ITEMS,
  serializeBoardData,
  type BoardConnector,
  type BoardData,
  type BoardItem,
  type ColorKey,
  type ItemType,
} from "./board-data";

type SaveState = "saved" | "dirty" | "saving" | "error";
type Tool = "select" | "connect";

/** Tinted fills work on both themes; text colour always comes from the theme token. */
const COLOR_CLASS: Record<ColorKey, { box: string; swatch: string; label: string }> = {
  yellow: { box: "bg-amber-400/25 border-amber-500/70", swatch: "bg-amber-400", label: "Yellow" },
  blue: { box: "bg-sky-400/25 border-sky-500/70", swatch: "bg-sky-400", label: "Blue" },
  green: { box: "bg-emerald-400/25 border-emerald-500/70", swatch: "bg-emerald-400", label: "Green" },
  pink: { box: "bg-pink-400/25 border-pink-500/70", swatch: "bg-pink-400", label: "Pink" },
  purple: { box: "bg-violet-400/25 border-violet-500/70", swatch: "bg-violet-400", label: "Purple" },
  gray: { box: "bg-slate-400/20 border-slate-500/60", swatch: "bg-slate-400", label: "Grey" },
};

const DEFAULT_SIZE: Record<ItemType, { w: number; h: number }> = {
  note: { w: 180, h: 130 },
  text: { w: 220, h: 40 },
  rect: { w: 170, h: 100 },
  ellipse: { w: 170, h: 100 },
};

const MIN_Z = 0.25;
const MAX_Z = 2.5;

function uid(): string {
  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Point where the line from the box centre towards (tx, ty) leaves the box. */
function edgePoint(it: BoardItem, tx: number, ty: number): { x: number; y: number } {
  const cx0 = it.x + it.w / 2;
  const cy0 = it.y + it.h / 2;
  const dx = tx - cx0;
  const dy = ty - cy0;
  if (dx === 0 && dy === 0) return { x: cx0, y: cy0 };
  const sx = dx === 0 ? Infinity : it.w / 2 / Math.abs(dx);
  const sy = dy === 0 ? Infinity : it.h / 2 / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: cx0 + dx * s, y: cy0 + dy * s };
}

export function Whiteboard({
  boardId,
  kind,
  initial,
  canWrite,
  save,
}: {
  boardId: string;
  kind: "WHITEBOARD" | "MINDMAP";
  initial: BoardData;
  canWrite: boolean;
  save: (boardId: string, dataJson: string) => Promise<ActionResult>;
}) {
  const isMind = kind === "MINDMAP";
  const [items, setItems] = useState<BoardItem[]>(initial.items);
  const [conns, setConns] = useState<BoardConnector[]>(initial.connectors);
  const [view, setView] = useState({ x: 40, y: 40, z: 1 });
  const [selItems, setSelItems] = useState<string[]>([]);
  const [selConn, setSelConn] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [color, setColor] = useState<ColorKey>("yellow");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef(items);
  const connsRef = useRef(conns);
  const versionRef = useRef(0);
  const firstRender = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const viewRef = useRef(view);
  viewRef.current = view;
  itemsRef.current = items;
  connsRef.current = conns;

  const pan = useRef<{ sx: number; sy: number; vx: number; vy: number } | null>(null);
  const drag = useRef<{ sx: number; sy: number; origins: Record<string, { x: number; y: number }>; moved: boolean } | null>(null);
  const resize = useRef<{ id: string; sx: number; sy: number; w: number; h: number } | null>(null);
  const lastTap = useRef<{ id: string; t: number } | null>(null);

  /* ── Autosave (debounced) ─────────────────────────────────────────────── */

  const flush = useCallback(async () => {
    if (!canWrite || savingRef.current) return;
    const v = versionRef.current;
    savingRef.current = true;
    setSaveState("saving");
    let r: ActionResult;
    try {
      r = await save(boardId, serializeBoardData({ items: itemsRef.current, connectors: connsRef.current }));
    } catch {
      r = { ok: false, error: "Could not reach the server." };
    }
    savingRef.current = false;
    if (!r.ok) {
      setSaveError(r.error);
      setSaveState("error");
      return;
    }
    setSaveError(null);
    if (versionRef.current === v) setSaveState("saved");
    else {
      setSaveState("dirty");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 600);
    }
  }, [boardId, canWrite, save]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (!canWrite) return;
    versionRef.current += 1;
    setSaveState((s) => (s === "saving" ? s : "dirty"));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 900);
  }, [items, conns, canWrite, flush]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (saveState === "dirty" || saveState === "saving" || saveState === "error") {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);

  /* ── Zoom with the wheel (native listener so we can preventDefault) ───── */

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      setView((v) => {
        const z = Math.min(MAX_Z, Math.max(MIN_Z, v.z * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
        const wx = (px - v.x) / v.z;
        const wy = (py - v.y) / v.z;
        return { z, x: px - wx * z, y: py - wy * z };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const zoomBy = (f: number) =>
    setView((v) => {
      const el = stageRef.current;
      const w = el?.clientWidth ?? 600;
      const h = el?.clientHeight ?? 400;
      const z = Math.min(MAX_Z, Math.max(MIN_Z, v.z * f));
      const wx = (w / 2 - v.x) / v.z;
      const wy = (h / 2 - v.y) / v.z;
      return { z, x: w / 2 - wx * z, y: h / 2 - wy * z };
    });

  /* ── Item helpers ─────────────────────────────────────────────────────── */

  const patchItem = (id: string, patch: Partial<BoardItem>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const viewCentre = () => {
    const el = stageRef.current;
    const v = viewRef.current;
    const w = el?.clientWidth ?? 600;
    const h = el?.clientHeight ?? 400;
    return { x: (w / 2 - v.x) / v.z, y: (h / 2 - v.y) / v.z };
  };

  const addItem = (type: ItemType, at?: { x: number; y: number }, text = ""): string | null => {
    if (!canWrite) return null;
    if (itemsRef.current.length >= MAX_ITEMS) {
      setSaveError(`A board holds up to ${MAX_ITEMS} items.`);
      return null;
    }
    const size = DEFAULT_SIZE[type];
    const c = at ?? viewCentre();
    const jitter = (itemsRef.current.length % 6) * 18;
    const id = uid();
    const item: BoardItem = {
      id,
      type,
      x: Math.round(c.x - size.w / 2 + (at ? 0 : jitter)),
      y: Math.round(c.y - size.h / 2 + (at ? 0 : jitter)),
      w: size.w,
      h: size.h,
      text,
      color: type === "text" ? "gray" : color,
    };
    setItems((prev) => [...prev, item]);
    setSelItems([id]);
    setSelConn(null);
    setTool("select");
    setConnectFrom(null);
    if (type === "note" || type === "text" || type === "rect" || type === "ellipse") setEditing(id);
    return id;
  };

  const addChild = () => {
    const parent = items.find((i) => i.id === selItems[0]);
    if (!parent || !canWrite) return;
    if (connsRef.current.length >= MAX_CONNECTORS) return;
    const kids = conns.filter((c) => c.from === parent.id).length;
    const id = addItem("rect", { x: parent.x + parent.w + 110, y: parent.y + parent.h / 2 + kids * (DEFAULT_SIZE.rect.h + 20) });
    if (id) {
      setConns((prev) => [...prev, { id: uid(), from: parent.id, to: id }]);
      const parentColor = parent.color;
      patchItem(id, { color: parentColor });
    }
  };

  const removeSelection = useCallback(() => {
    if (!canWrite) return;
    if (selConn) {
      setConns((prev) => prev.filter((c) => c.id !== selConn));
      setSelConn(null);
      return;
    }
    if (selItems.length === 0) return;
    const gone = new Set(selItems);
    setItems((prev) => prev.filter((i) => !gone.has(i.id)));
    setConns((prev) => prev.filter((c) => !gone.has(c.from) && !gone.has(c.to)));
    setSelItems([]);
    setEditing(null);
  }, [canWrite, selConn, selItems]);

  const duplicateSelection = () => {
    if (!canWrite || selItems.length === 0) return;
    const room = MAX_ITEMS - itemsRef.current.length;
    const src = itemsRef.current.filter((i) => selItems.includes(i.id)).slice(0, Math.max(0, room));
    const copies = src.map((i) => ({ ...i, id: uid(), x: i.x + 24, y: i.y + 24 }));
    if (copies.length === 0) return;
    setItems((prev) => [...prev, ...copies]);
    setSelItems(copies.map((c) => c.id));
  };

  const applyColor = (c: ColorKey) => {
    setColor(c);
    if (!canWrite || selItems.length === 0) return;
    const ids = new Set(selItems);
    setItems((prev) => prev.map((i) => (ids.has(i.id) ? { ...i, color: c } : i)));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (editing) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      removeSelection();
    } else if (e.key === "Enter" && canWrite && selItems.length === 1) {
      e.preventDefault();
      setEditing(selItems[0]);
    } else if (e.key === "Escape") {
      setSelItems([]);
      setSelConn(null);
      setTool("select");
      setConnectFrom(null);
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
      e.preventDefault();
      duplicateSelection();
    }
  };

  /* ── Pointer handling ─────────────────────────────────────────────────── */

  const onStageDown = (e: React.PointerEvent) => {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.bg) return;
    stageRef.current?.focus();
    setSelItems([]);
    setSelConn(null);
    setConnectFrom(null);
    setEditing(null);
    pan.current = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
    stageRef.current?.setPointerCapture(e.pointerId);
  };

  const onItemDown = (e: React.PointerEvent, it: BoardItem) => {
    e.stopPropagation();
    stageRef.current?.focus();
    if (editing === it.id) return;
    setSelConn(null);

    if (tool === "connect" && canWrite) {
      if (!connectFrom) {
        setConnectFrom(it.id);
        setSelItems([it.id]);
      } else if (connectFrom !== it.id) {
        const exists = connsRef.current.some(
          (c) => (c.from === connectFrom && c.to === it.id) || (c.from === it.id && c.to === connectFrom),
        );
        if (!exists && connsRef.current.length < MAX_CONNECTORS) {
          setConns((prev) => [...prev, { id: uid(), from: connectFrom, to: it.id }]);
        }
        setConnectFrom(null);
        setSelItems([it.id]);
      }
      return;
    }

    // Double-tap to edit (pointer capture retargets native dblclick, so detect it here).
    const now = Date.now();
    if (!e.shiftKey && canWrite && lastTap.current && lastTap.current.id === it.id && now - lastTap.current.t < 350) {
      lastTap.current = null;
      setSelItems([it.id]);
      setEditing(it.id);
      return;
    }
    lastTap.current = { id: it.id, t: now };

    const next = e.shiftKey
      ? selItems.includes(it.id)
        ? selItems.filter((x) => x !== it.id)
        : [...selItems, it.id]
      : selItems.includes(it.id)
        ? selItems
        : [it.id];
    setSelItems(next);
    if (!canWrite || !next.includes(it.id)) return;
    const origins: Record<string, { x: number; y: number }> = {};
    for (const i of itemsRef.current) if (next.includes(i.id)) origins[i.id] = { x: i.x, y: i.y };
    drag.current = { sx: e.clientX, sy: e.clientY, origins, moved: false };
    stageRef.current?.setPointerCapture(e.pointerId);
  };

  const onResizeDown = (e: React.PointerEvent, it: BoardItem) => {
    e.stopPropagation();
    if (!canWrite) return;
    resize.current = { id: it.id, sx: e.clientX, sy: e.clientY, w: it.w, h: it.h };
    stageRef.current?.setPointerCapture(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    const z = viewRef.current.z;
    if (pan.current) {
      const p = pan.current;
      setView((v) => ({ ...v, x: p.vx + (e.clientX - p.sx), y: p.vy + (e.clientY - p.sy) }));
    } else if (resize.current) {
      const r = resize.current;
      patchItem(r.id, {
        w: Math.round(Math.min(1200, Math.max(60, r.w + (e.clientX - r.sx) / z))),
        h: Math.round(Math.min(1200, Math.max(30, r.h + (e.clientY - r.sy) / z))),
      });
    } else if (drag.current) {
      const d = drag.current;
      const dx = (e.clientX - d.sx) / z;
      const dy = (e.clientY - d.sy) / z;
      if (!d.moved && Math.abs(dx) + Math.abs(dy) < 3 / z) return;
      d.moved = true;
      setItems((prev) =>
        prev.map((i) => {
          const o = d.origins[i.id];
          return o ? { ...i, x: Math.round(o.x + dx), y: Math.round(o.y + dy) } : i;
        }),
      );
    }
  };

  const onUp = () => {
    pan.current = null;
    drag.current = null;
    resize.current = null;
  };

  /* ── Rendering helpers ────────────────────────────────────────────────── */

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const single = selItems.length === 1 ? itemById.get(selItems[0]) : undefined;
  const empty = items.length === 0;

  const statusLabel =
    saveState === "saved" ? "Saved" : saveState === "saving" ? "Saving…" : saveState === "dirty" ? "Unsaved changes" : "Save failed";
  const statusTone =
    saveState === "saved" ? "text-success" : saveState === "error" ? "text-danger" : "text-muted";

  const toolBtn =
    "inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border border-border bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-text hover:border-brand disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div
      className={cx(
        "flex flex-col gap-3",
        fullscreen && "fixed inset-0 z-50 bg-bg p-3",
      )}
    >
      <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-border bg-surface p-2">
        {canWrite ? (
          <>
            <button type="button" className={toolBtn} onClick={() => addItem("note")} title="Add a sticky note">
              <Icon name="plus" className="h-3.5 w-3.5" /> Note
            </button>
            <button type="button" className={toolBtn} onClick={() => addItem("text")} title="Add a text label">
              <Icon name="heading" className="h-3.5 w-3.5" /> Text
            </button>
            <button type="button" className={toolBtn} onClick={() => addItem("rect")} title="Add a rectangle">
              <span className="inline-block h-3 w-3.5 rounded-[2px] border-2 border-current" aria-hidden /> Rectangle
            </button>
            <button type="button" className={toolBtn} onClick={() => addItem("ellipse")} title="Add an ellipse">
              <span className="inline-block h-3 w-3.5 rounded-full border-2 border-current" aria-hidden /> Ellipse
            </button>
            {isMind ? (
              <>
                <span className="mx-1 h-5 w-px bg-border" aria-hidden />
                <button
                  type="button"
                  className={cx(toolBtn, tool === "connect" && "border-brand bg-brand/15 text-brand")}
                  aria-pressed={tool === "connect"}
                  onClick={() => {
                    setTool((t) => (t === "connect" ? "select" : "connect"));
                    setConnectFrom(null);
                  }}
                  title="Click two nodes to join them"
                >
                  <Icon name="link" className="h-3.5 w-3.5" /> Connect
                </button>
                <button type="button" className={toolBtn} onClick={addChild} disabled={!single} title="Add a node linked to the selected one">
                  <Icon name="plus" className="h-3.5 w-3.5" /> Add child
                </button>
              </>
            ) : null}
            <span className="mx-1 h-5 w-px bg-border" aria-hidden />
            <div className="flex items-center gap-1" role="group" aria-label="Colour">
              {COLOR_KEYS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => applyColor(c)}
                  aria-label={`${COLOR_CLASS[c].label} colour`}
                  aria-pressed={color === c}
                  className={cx(
                    "h-5 w-5 rounded-full border-2",
                    COLOR_CLASS[c].swatch,
                    color === c ? "border-text" : "border-transparent",
                  )}
                />
              ))}
            </div>
            <span className="mx-1 h-5 w-px bg-border" aria-hidden />
            <button type="button" className={toolBtn} onClick={duplicateSelection} disabled={selItems.length === 0} aria-label="Duplicate selection">
              <Icon name="copy" className="h-3.5 w-3.5" /> Duplicate
            </button>
            <button type="button" className={toolBtn} onClick={removeSelection} disabled={selItems.length === 0 && !selConn} aria-label="Delete selection">
              <Icon name="trash" className="h-3.5 w-3.5" /> Delete
            </button>
          </>
        ) : (
          <span className="px-1 text-xs text-muted">View only. Your role cannot edit boards.</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1" role="group" aria-label="Zoom">
            <button type="button" className={toolBtn} onClick={() => zoomBy(1 / 1.2)} aria-label="Zoom out">−</button>
            <button type="button" className={cx(toolBtn, "min-w-14 justify-center")} onClick={() => setView({ x: 40, y: 40, z: 1 })} aria-label="Reset zoom">
              {Math.round(view.z * 100)}%
            </button>
            <button type="button" className={toolBtn} onClick={() => zoomBy(1.2)} aria-label="Zoom in">+</button>
            <button type="button" className={toolBtn} onClick={() => setFullscreen((f) => !f)} aria-pressed={fullscreen} aria-label="Toggle full screen">
              <Icon name="panel" className="h-3.5 w-3.5" />
            </button>
          </div>
          {canWrite ? (
            <span role="status" aria-live="polite" className={cx("inline-flex items-center gap-1.5 text-xs font-medium", statusTone)} title={saveError ?? undefined}>
              <span className={cx("h-2 w-2 rounded-full", saveState === "saved" ? "bg-success" : saveState === "error" ? "bg-danger" : "bg-warn")} />
              {statusLabel}
              {saveState === "error" ? (
                <button type="button" onClick={() => void flush()} className="underline">Retry</button>
              ) : null}
            </span>
          ) : null}
        </div>
      </div>
      {saveError && saveState === "error" ? (
        <p role="alert" className="rounded-[var(--radius-control)] border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {saveError}
        </p>
      ) : null}

      <div
        ref={stageRef}
        tabIndex={0}
        role="application"
        aria-label={isMind ? "Mind map canvas" : "Whiteboard canvas"}
        data-bg="1"
        onKeyDown={onKeyDown}
        onPointerDown={onStageDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className={cx(
          "relative touch-none overflow-hidden rounded-[var(--radius-card)] border border-border bg-bg focus:border-brand",
          fullscreen ? "min-h-0 flex-1" : "h-[62vh] min-h-[360px]",
          tool === "connect" ? "cursor-crosshair" : "cursor-grab",
        )}
        style={{
          backgroundImage: "radial-gradient(circle, var(--color-border) 1px, transparent 1px)",
          backgroundSize: `${24 * view.z}px ${24 * view.z}px`,
          backgroundPosition: `${view.x}px ${view.y}px`,
        }}
      >
        <div
          data-bg="1"
          className="absolute left-0 top-0 origin-top-left"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}
        >
          <svg className="pointer-events-none absolute left-0 top-0 h-px w-px overflow-visible text-muted" aria-hidden>
            {conns.map((c) => {
              const a = itemById.get(c.from);
              const b = itemById.get(c.to);
              if (!a || !b) return null;
              const p1 = edgePoint(a, b.x + b.w / 2, b.y + b.h / 2);
              const p2 = edgePoint(b, a.x + a.w / 2, a.y + a.h / 2);
              const mx = (p1.x + p2.x) / 2;
              const d = `M ${p1.x} ${p1.y} C ${mx} ${p1.y}, ${mx} ${p2.y}, ${p2.x} ${p2.y}`;
              const selected = selConn === c.id;
              return (
                <g key={c.id}>
                  <path d={d} fill="none" stroke="currentColor" strokeWidth={selected ? 3 : 2} className={selected ? "text-brand" : "text-muted"} />
                  <path
                    d={d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={14}
                    className="pointer-events-auto cursor-pointer"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      stageRef.current?.focus();
                      setSelConn(c.id);
                      setSelItems([]);
                    }}
                  />
                </g>
              );
            })}
          </svg>

          {items.map((it) => {
            const selected = selItems.includes(it.id);
            const isEditing = editing === it.id;
            const shape =
              it.type === "ellipse" ? "rounded-[50%] border-2" : it.type === "rect" ? "rounded-lg border-2" : it.type === "note" ? "rounded-md border shadow-md" : "rounded border border-transparent";
            return (
              <div
                key={it.id}
                onPointerDown={(e) => onItemDown(e, it)}
                className={cx(
                  "absolute select-none",
                  shape,
                  it.type !== "text" && COLOR_CLASS[it.color].box,
                  selected && "ring-2 ring-brand ring-offset-1 ring-offset-bg",
                  connectFrom === it.id && "ring-2 ring-warn",
                  canWrite && tool === "select" ? "cursor-move" : "cursor-pointer",
                )}
                style={{ left: it.x, top: it.y, width: it.w, height: it.h }}
              >
                {isEditing ? (
                  <textarea
                    autoFocus
                    aria-label="Item text"
                    value={it.text}
                    maxLength={2000}
                    onChange={(e) => patchItem(it.id, { text: e.target.value })}
                    onBlur={() => setEditing(null)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Escape") (e.target as HTMLTextAreaElement).blur();
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    className={cx(
                      "h-full w-full resize-none bg-transparent p-2 text-sm text-text outline-none",
                      it.type !== "note" && it.type !== "text" && "text-center",
                    )}
                  />
                ) : (
                  <div
                    className={cx(
                      "h-full w-full overflow-hidden whitespace-pre-wrap break-words p-2 text-sm text-text",
                      it.type !== "note" && it.type !== "text" && "flex items-center justify-center text-center",
                      it.type === "text" && "font-medium",
                    )}
                  >
                    {it.text || <span className="text-muted/70">{canWrite ? "Double-click to edit" : ""}</span>}
                  </div>
                )}
                {selected && single?.id === it.id && canWrite && !isEditing ? (
                  <span
                    onPointerDown={(e) => onResizeDown(e, it)}
                    className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-nwse-resize rounded-sm border-2 border-brand bg-surface"
                    aria-label="Resize"
                    role="presentation"
                  />
                ) : null}
              </div>
            );
          })}
        </div>

        {empty ? (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm font-medium">{isMind ? "Empty mind map" : "Empty whiteboard"}</p>
            <p className="max-w-xs text-xs text-muted">
              {canWrite
                ? isMind
                  ? "Start with a central idea, then use Add child to branch out, or Connect to link any two nodes."
                  : "Add a note, text or shape from the toolbar. Drag to move, use the corner handle to resize."
                : "Nothing has been added to this board yet."}
            </p>
            {canWrite && isMind ? (
              <button type="button" className={cx(toolBtn, "pointer-events-auto mt-1")} onClick={() => addItem("ellipse", undefined, "")}>
                <Icon name="plus" className="h-3.5 w-3.5" /> Add central idea
              </button>
            ) : null}
          </div>
        ) : null}

        {tool === "connect" ? (
          <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-brand/15 px-3 py-1 text-xs font-medium text-brand">
            {connectFrom ? "Now click the node to connect to" : "Click the first node"}
          </div>
        ) : null}
      </div>

      <p className="text-[11px] text-muted">
        Shift+click selects several · Delete removes · Ctrl/Cmd+D duplicates · double-click or Enter edits · drag empty space to pan · scroll to zoom
        {isMind ? " · click a line to select it" : ""}
      </p>
    </div>
  );
}
