/**
 * Server-side validation for Sheet cellsJson (untrusted client input).
 * Kept separate from the pure sheets helpers so client bundles never
 * import server-only validation accidentally.
 */

import { GRID_COLS, GRID_ROWS, colLetter } from "./sheets";

export const MAX_CELLS_JSON_BYTES = 256 * 1024; // 256 KB of sparse cell data

export function parseCellsJson(raw: string): Record<string, { v?: string; s?: Record<string, unknown> }> {
  if (Buffer.byteLength(raw, "utf8") > MAX_CELLS_JSON_BYTES) {
    throw new Error("Sheet is too large to save (256 KB of cell data max)");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Sheet data is corrupt — reload the page and try again");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Sheet data is corrupt — reload the page and try again");
  }

  const out: Record<string, { v?: string; s?: Record<string, unknown> }> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    const m = key.match(/^([A-Z])(\d{1,3})$/);
    if (!m) continue; // silently drop malformed keys
    const col = m[1].charCodeAt(0) - 65;
    const row = parseInt(m[2], 10);
    if (col < 0 || col >= GRID_COLS || row < 1 || row > GRID_ROWS) continue;
    if (value === null || typeof value !== "object") continue;
    const cell = value as { v?: unknown; s?: unknown };
    const clean: { v?: string; s?: Record<string, unknown> } = {};
    if (typeof cell.v === "string") clean.v = cell.v.slice(0, 5000);
    if (cell.s && typeof cell.s === "object" && !Array.isArray(cell.s)) {
      clean.s = cell.s as Record<string, unknown>;
    }
    if (clean.v !== undefined || clean.s !== undefined) out[key] = clean;
  }
  return out;
}

/** Column letters header for the grid (A..Z). */
export function gridHeader(): string[] {
  return Array.from({ length: GRID_COLS }, (_, i) => colLetter(i));
}
