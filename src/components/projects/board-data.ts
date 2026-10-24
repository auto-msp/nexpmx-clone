/**
 * Board canvas data model. Pure module shared by the client canvas, the board
 * pages and the save action (which re-validates everything it receives).
 */

export const COLOR_KEYS = ["yellow", "blue", "green", "pink", "purple", "gray"] as const;
export type ColorKey = (typeof COLOR_KEYS)[number];

export const ITEM_TYPES = ["note", "text", "rect", "ellipse"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export interface BoardItem {
  id: string;
  type: ItemType;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  color: ColorKey;
}

export interface BoardConnector {
  id: string;
  from: string;
  to: string;
}

export interface BoardData {
  items: BoardItem[];
  connectors: BoardConnector[];
}

export const MAX_ITEMS = 400;
export const MAX_CONNECTORS = 800;
export const MAX_TEXT = 2000;

function num(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return Math.min(max, Math.max(min, n));
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

/** Defensive parse: never throws, drops anything malformed. */
export function parseBoardData(raw: string | null | undefined): BoardData {
  let json: unknown;
  try {
    json = JSON.parse(raw ?? "");
  } catch {
    return { items: [], connectors: [] };
  }
  const root = (json && typeof json === "object" ? json : {}) as { items?: unknown; connectors?: unknown };
  const items: BoardItem[] = [];
  const seen = new Set<string>();
  if (Array.isArray(root.items)) {
    for (const r of root.items.slice(0, MAX_ITEMS)) {
      if (!r || typeof r !== "object") continue;
      const o = r as Record<string, unknown>;
      const id = str(o.id, 40);
      if (!id || seen.has(id)) continue;
      const type = ITEM_TYPES.includes(o.type as ItemType) ? (o.type as ItemType) : "note";
      const color = COLOR_KEYS.includes(o.color as ColorKey) ? (o.color as ColorKey) : "yellow";
      seen.add(id);
      items.push({
        id,
        type,
        x: num(o.x, 0, -20000, 20000),
        y: num(o.y, 0, -20000, 20000),
        w: num(o.w, 160, 40, 1200),
        h: num(o.h, 100, 28, 1200),
        text: str(o.text, MAX_TEXT),
        color,
      });
    }
  }
  const connectors: BoardConnector[] = [];
  const cseen = new Set<string>();
  if (Array.isArray(root.connectors)) {
    for (const r of root.connectors.slice(0, MAX_CONNECTORS)) {
      if (!r || typeof r !== "object") continue;
      const o = r as Record<string, unknown>;
      const id = str(o.id, 40);
      const from = str(o.from, 40);
      const to = str(o.to, 40);
      if (!id || cseen.has(id) || from === to || !seen.has(from) || !seen.has(to)) continue;
      cseen.add(id);
      connectors.push({ id, from, to });
    }
  }
  return { items, connectors };
}

export function serializeBoardData(d: BoardData): string {
  return JSON.stringify({ items: d.items, connectors: d.connectors });
}
