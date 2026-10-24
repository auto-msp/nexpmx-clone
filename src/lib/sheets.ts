/**
 * Sheets helpers — cell addressing, CSV export, number formatting.
 *
 * PROVENANCE (screenshot evidence): a workbook list ("All sheets", Recent,
 * empty state with Create Sheet) and a grid editor: column letters A–Z with
 * per-column filter arrows, row numbers 1–100, a formula bar ("Enter value
 * or formula…", fx), a toolbar (bold/italic/underline, alignment, text color,
 * fill, ₹ / % / calendar / # formats, decimals, merge, clear, sort, filter,
 * freeze, list, undo/redo), Export and Share buttons. Structural facts
 * mirrored; the grid is our own implementation with a small, honest formula
 * set: =SUM(range), =AVG(range), =MIN, =MAX, =COUNT, and direct cell
 * references. Everything else is stored as plain text.
 */

export const GRID_COLS = 26; // A..Z
export const GRID_ROWS = 100; // 1..100

export function colLetter(index: number): string {
  if (index < 0 || index >= GRID_COLS) return "";
  return String.fromCharCode(65 + index);
}

export function colIndex(letter: string): number {
  return letter.toUpperCase().charCodeAt(0) - 65;
}

export function cellId(row: number, col: number): string {
  return `${colLetter(col)}${row + 1}`;
}

export type CellStyle = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: "left" | "center" | "right";
  format?: "text" | "inr" | "percent" | "number" | "date";
  decimals?: number;
};

export interface CellValue {
  v?: string; // raw user input (may start with "=")
  s?: CellStyle;
}

/** cellsJson shape stored on the Sheet row. */
export type Cells = Record<string, CellValue>;

/** Parse "=SUM(A1:A10)" / "=A1" / "=B2*2+1" style formulas. Pure. */
export function evalCell(
  cells: Cells,
  raw: string,
  seen: Set<string> = new Set(),
  depth = 0,
): string {
  const v = raw.trim();
  if (!v.startsWith("=")) return v;
  if (depth > 16) return "#LOOP";
  try {
    // Range functions: =SUM(A1:A9), =AVG(..), MIN, MAX, COUNT.
    const rangeCall = v.match(/^=(SUM|AVG|MIN|MAX|COUNT)\(([A-Z]+\d+):([A-Z]+\d+)\)$/i);
    if (rangeCall) {
      const fn = rangeCall[1].toUpperCase();
      const c1 = colIndex(rangeCall[2].charAt(0));
      const r1 = parseInt(rangeCall[2].slice(1), 10) - 1;
      const c2 = colIndex(rangeCall[3].charAt(0));
      const r2 = parseInt(rangeCall[3].slice(1), 10) - 1;
      const nums: number[] = [];
      for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
        for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
          const val = resolveCell(cells, cellId(r, c), seen, depth);
          const n = parseFloat(val);
          if (!Number.isNaN(n)) nums.push(n);
        }
      }
      switch (fn) {
        case "SUM": return String(nums.reduce((a, b) => a + b, 0));
        case "AVG": return nums.length ? String(nums.reduce((a, b) => a + b, 0) / nums.length) : "#DIV/0";
        case "MIN": return nums.length ? String(Math.min(...nums)) : "#N/A";
        case "MAX": return nums.length ? String(Math.max(...nums)) : "#N/A";
        case "COUNT": return String(nums.length);
      }
    }
    // Cell reference: =A1 → target's evaluated value.
    const ref = v.match(/^=([A-Z]+\d+)$/i);
    if (ref) {
      const id = ref[1].toUpperCase();
      if (seen.has(id)) return "#LOOP";
      return resolveCell(cells, id, seen, depth);
    }
    // Arithmetic over cell refs and numbers: =A1*2+3
    const expr = v.slice(1).replace(/[^0-9+\-*/(). A-Z]/gi, "");
    const substituted = expr.replace(/\b([A-Z])(\d+)\b/gi, (_m, L, d) => {
      const id = `${String(L).toUpperCase()}${d}`;
      const val = resolveCell(cells, id, seen, depth);
      return Number.isNaN(parseFloat(val)) ? "0" : String(parseFloat(val));
    });
    if (!/^[-0-9+*/(). ]+$/.test(substituted)) return "#ERR";
    // CSP-safe: the strict Content-Security-Policy forbids 'unsafe-eval', so
    // new Function()/eval would throw EvalError in the browser. A tiny
    // recursive-descent parser keeps formulas working under CSP.
    const out = evalArithmetic(substituted);
    return Number.isFinite(out) ? String(out) : "#ERR";
  } catch {
    return "#ERR";
  }
}

/** Evaluate a sanitized arithmetic expression (numbers, operators, parens). Pure. */
function evalArithmetic(expr: string): number {
  let pos = 0;

  function skipWs() {
    while (pos < expr.length && expr[pos] === " ") pos++;
  }

  function parseExpression(): number {
    let value = parseTerm();
    for (;;) {
      skipWs();
      const op = expr[pos];
      if (op === "+" || op === "-") {
        pos++;
        const rhs = parseTerm();
        value = op === "+" ? value + rhs : value - rhs;
      } else {
        return value;
      }
    }
  }

  function parseTerm(): number {
    let value = parseFactor();
    for (;;) {
      skipWs();
      const op = expr[pos];
      if (op === "*" || op === "/") {
        pos++;
        const rhs = parseFactor();
        value = op === "*" ? value * rhs : value / rhs;
      } else {
        return value;
      }
    }
  }

  function parseFactor(): number {
    skipWs();
    if (expr[pos] === "-") {
      pos++;
      return -parseFactor();
    }
    if (expr[pos] === "+") {
      pos++;
      return parseFactor();
    }
    if (expr[pos] === "(") {
      pos++;
      const value = parseExpression();
      skipWs();
      if (expr[pos] !== ")") throw new Error("expected closing paren");
      pos++;
      return value;
    }
    const start = pos;
    while (pos < expr.length && /[0-9.]/.test(expr[pos])) pos++;
    if (pos === start) throw new Error("unexpected token");
    const n = parseFloat(expr.slice(start, pos));
    if (Number.isNaN(n)) throw new Error("bad number");
    return n;
  }

  const value = parseExpression();
  skipWs();
  if (pos !== expr.length) throw new Error("trailing input");
  return value;
}

function resolveCell(cells: Cells, id: string, seen: Set<string>, depth: number): string {
  if (seen.has(id)) return "#LOOP";
  const raw = cells[id]?.v ?? "";
  if (raw.startsWith("=")) {
    seen.add(id);
    return evalCell(cells, raw, new Set(seen), depth + 1);
  }
  return raw;
}

/** Format a computed value per its style. Pure. */
export function displayValue(value: string, style?: CellStyle): string {
  if (!value) return "";
  const n = parseFloat(value);
  switch (style?.format) {
    case "inr":
      return Number.isNaN(n) ? value : `₹${n.toLocaleString("en-IN", { maximumFractionDigits: style.decimals ?? 0 })}`;
    case "percent":
      return Number.isNaN(n) ? value : `${(n * 100).toFixed(style.decimals ?? 0)}%`;
    case "number":
      return Number.isNaN(n) ? value : n.toLocaleString("en-IN", { minimumFractionDigits: style.decimals ?? 0, maximumFractionDigits: style.decimals ?? 2 });
    case "date": {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? value : d.toISOString().slice(0, 10);
    }
    default:
      return value;
  }
}

/** Export to CSV, quoting as needed. Pure — unit-tested. */
export function cellsToCsv(cells: Cells, rows = GRID_ROWS, cols = GRID_COLS): string {
  const lines: string[] = [];
  for (let r = 0; r < rows; r++) {
    const fields: string[] = [];
    for (let c = 0; c < cols; c++) {
      const id = cellId(r, c);
      const raw = cells[id]?.v ?? "";
      const value = displayValue(evalCell(cells, raw), cells[id]?.s);
      fields.push(/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
    }
    lines.push(fields.join(","));
  }
  // Trim trailing fully-empty rows/lines.
  while (lines.length && /^,*$/.test(lines[lines.length - 1])) lines.pop();
  return lines.join("\n");
}
