/**
 * Business Memory helpers — pure parsing/formatting for the Memory module.
 *
 * PROVENANCE (screenshot evidence): Business Memory list with category chips
 * (General, Clients, Delivery, Finance, Team, Tools), an "Add memory" form,
 * a "What we know" rolling summary card, a "Memory questions" suggestion log
 * with an answered/open state, and a paste-import flow. Parsing is pure so
 * it is unit-testable; persistence lives in the server actions.
 */

export const MEMORY_CATEGORIES = [
  "general",
  "clients",
  "delivery",
  "finance",
  "team",
  "tools",
] as const;

export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export function isMemoryCategory(v: string): v is MemoryCategory {
  return (MEMORY_CATEGORIES as readonly string[]).includes(v);
}

export interface ParsedFact {
  category: MemoryCategory;
  factKey: string;
  value: string;
}

/**
 * Parse pasted import text. Accepted shapes per non-empty line:
 *   key: value
 *   key = value
 *   category|key: value      (e.g. "clients|acme-billing: Net-30")
 * Lines without a separator are skipped (return as `skipped` so the caller
 * can report how many lines were ignored). Values are trimmed; keys are
 * lowercased with spaces→dashes. Pure — unit-tested.
 */
export function parseMemoryImport(text: string): {
  facts: ParsedFact[];
  skipped: number;
} {
  const facts: ParsedFact[] = [];
  let skipped = 0;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const sep = line.indexOf(":") >= 0 ? ":" : line.indexOf("=") >= 0 ? "=" : null;
    if (sep === null) {
      skipped += 1;
      continue;
    }

    let head = line.slice(0, line.indexOf(sep)).trim();
    const value = line.slice(line.indexOf(sep) + 1).trim();
    if (!head || !value) {
      skipped += 1;
      continue;
    }

    let category: MemoryCategory = "general";
    const pipe = head.indexOf("|");
    if (pipe >= 0) {
      const candidate = head.slice(0, pipe).trim().toLowerCase();
      const rest = head.slice(pipe + 1).trim();
      if (isMemoryCategory(candidate)) {
        category = candidate;
        head = rest;
      } else {
        // Unknown prefix: keep it in the key so no information is lost.
        head = `${candidate}-${rest}`;
      }
    }

    const factKey = head
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "")
      .slice(0, 80);
    if (!factKey) {
      skipped += 1;
      continue;
    }

    facts.push({ category, factKey, value: value.slice(0, 500) });
  }

  return { facts, skipped };
}

/** Import summary for the result card. Pure. */
export function summariseImport(facts: ParsedFact[], skipped: number): string {
  const byCat = new Map<string, number>();
  for (const f of facts) byCat.set(f.category, (byCat.get(f.category) ?? 0) + 1);
  const parts = [...byCat.entries()].map(([c, n]) => `${n} ${c}`);
  const head = facts.length ? `${facts.length} facts imported` : "Nothing imported";
  const tail = parts.length ? ` (${parts.join(", ")})` : "";
  const skip = skipped ? ` — ${skipped} line${skipped === 1 ? "" : "s"} skipped` : "";
  return `${head}${tail}${skip}`;
}

/**
 * Roll memory facts into a short "What we know" paragraph grouped by
 * category. Deterministic ordering; caps each category to 3 facts. Pure.
 */
export function rollupWhatWeKnow(
  facts: Array<{ category: string; factKey: string; value: string }>,
): string {
  const byCat = new Map<string, string[]>();
  for (const f of facts) {
    const list = byCat.get(f.category) ?? [];
    if (list.length < 3) list.push(`${f.factKey}: ${f.value}`);
    byCat.set(f.category, list);
  }
  const order = [...MEMORY_CATEGORIES].filter((c) => byCat.has(c));
  return order
    .map((c) => `${c.charAt(0).toUpperCase() + c.slice(1)} — ${byCat.get(c)!.join("; ")}.`)
    .join(" ");
}
