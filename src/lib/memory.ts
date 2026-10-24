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

/* ═══════════════════════════════════════════════════════════════════════════
 * Memory areas, score, guided questions and flexible import parsing.
 * Additive: everything above keeps working. Stored `category` is a free
 * string; legacy categories (general / delivery / tools) map onto areas.
 * Pure + dependency-free so client components can import it too.
 * ═══════════════════════════════════════════════════════════════════════════ */

export const MEMORY_AREAS = [
  { id: "decide", label: "How you decide", blurb: "The lines you will and will not cross, and the reasons behind them." },
  { id: "operations", label: "Operations", blurb: "How work really travels through the business day to day." },
  { id: "finance", label: "Finance", blurb: "How money arrives, leaves and gets signed off." },
  { id: "clients", label: "Clients", blurb: "Who they are, how they behave and what they count on." },
  { id: "projects", label: "Projects", blurb: "How scope is set, delivery is run and work is called finished." },
  { id: "ways", label: "Ways of working", blurb: "The unwritten rules a stand-in would need to cover for you." },
  { id: "team", label: "Team", blurb: "Who owns what and what each person is trusted to do alone." },
  { id: "market", label: "Market", blurb: "Where new work comes from and who else is competing for it." },
] as const;

export type MemoryAreaId = (typeof MEMORY_AREAS)[number]["id"];

const LEGACY_AREA: Record<string, MemoryAreaId> = {
  general: "ways",
  delivery: "projects",
  tools: "operations",
};

export function isAreaId(v: string): v is MemoryAreaId {
  return MEMORY_AREAS.some((a) => a.id === v);
}

/** Map any stored category (new or legacy) to one of the eight areas. */
export function areaOf(category: string): MemoryAreaId {
  const c = category.toLowerCase();
  if (isAreaId(c)) return c;
  return LEGACY_AREA[c] ?? "ways";
}

export function areaLabel(id: string): string {
  return MEMORY_AREAS.find((a) => a.id === id)?.label ?? "Ways of working";
}

/** "acme-billing-terms" → "Acme billing terms". */
export function humanizeKey(key: string): string {
  const s = key.replace(/^q-/, "").replace(/[-_]+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : key;
}

export function slugKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 80);
}

// ── Guided question bank (original wording) ─────────────────────────────────

export interface BankQuestion {
  id: string;
  area: MemoryAreaId;
  text: string;
}

export const QUESTION_BANK: BankQuestion[] = [
  { id: "decide-1", area: "decide", text: "What kind of work do you turn down, even when the money is good?" },
  { id: "decide-2", area: "decide", text: "When two things compete for the same week, how do you pick which one wins?" },
  { id: "decide-3", area: "decide", text: "Which decisions do you keep for yourself, and which are fine for others to make?" },
  { id: "decide-4", area: "decide", text: "What would make you walk away from a client mid-project?" },
  { id: "decide-5", area: "decide", text: "How do you decide when a price is too low to accept?" },
  { id: "operations-1", area: "operations", text: "Walk through what happens from the day a new client says yes to the first day of work." },
  { id: "operations-2", area: "operations", text: "Which tools does the business depend on, and what is each one used for?" },
  { id: "operations-3", area: "operations", text: "What is the one process that breaks first when you are away for a week?" },
  { id: "operations-4", area: "operations", text: "Where do requests usually arrive, and who is meant to pick them up?" },
  { id: "operations-5", area: "operations", text: "Which recurring jobs happen weekly or monthly, and who does them?" },
  { id: "finance-1", area: "finance", text: "How do you set a price for a new piece of work?" },
  { id: "finance-2", area: "finance", text: "What are your standard payment terms, and when do you bend them?" },
  { id: "finance-3", area: "finance", text: "What happens, step by step, when an invoice goes past its due date?" },
  { id: "finance-4", area: "finance", text: "Which expenses can the team approve alone, and which need you?" },
  { id: "finance-5", area: "finance", text: "How do you decide whether a project made money?" },
  { id: "clients-1", area: "clients", text: "What do your best clients have in common?" },
  { id: "clients-2", area: "clients", text: "Which warning signs tell you a client relationship is slipping?" },
  { id: "clients-3", area: "clients", text: "How often does each kind of client expect to hear from you, and in what form?" },
  { id: "clients-4", area: "clients", text: "What do clients most often misunderstand about how you work?" },
  { id: "clients-5", area: "clients", text: "How do you handle a client who goes quiet for a few weeks?" },
  { id: "projects-1", area: "projects", text: "How do you turn a signed scope into a plan the team can follow?" },
  { id: "projects-2", area: "projects", text: "What does finished mean here, and who confirms it?" },
  { id: "projects-3", area: "projects", text: "How do you handle a request that falls outside the agreed scope?" },
  { id: "projects-4", area: "projects", text: "What are the usual reasons a project slips, and how early do you spot them?" },
  { id: "projects-5", area: "projects", text: "What do you look back on at the end of a project?" },
  { id: "ways-1", area: "ways", text: "What are the house rules for replying to messages and emails?" },
  { id: "ways-2", area: "ways", text: "How do you want bad news delivered to you?" },
  { id: "ways-3", area: "ways", text: "Which meetings are worth having and which should be a message instead?" },
  { id: "ways-4", area: "ways", text: "What does a good handover look like?" },
  { id: "ways-5", area: "ways", text: "Which habits do you expect from everyone, with no exceptions?" },
  { id: "team-1", area: "team", text: "Who owns each part of the business today?" },
  { id: "team-2", area: "team", text: "What is each person trusted to do without asking first?" },
  { id: "team-3", area: "team", text: "Who steps in when someone is unavailable?" },
  { id: "team-4", area: "team", text: "How do you decide whom to bring in when the workload spikes?" },
  { id: "team-5", area: "team", text: "What do you look for when hiring or choosing a freelancer?" },
  { id: "market-1", area: "market", text: "Where does most new work come from right now?" },
  { id: "market-2", area: "market", text: "Who do you most often compete against, and why do you win or lose?" },
  { id: "market-3", area: "market", text: "Which kind of customer would you like more of next year?" },
  { id: "market-4", area: "market", text: "How do you describe what you do to someone who has never heard of you?" },
  { id: "market-5", area: "market", text: "What has changed in your market over the last year?" },
];

export function bankQuestionOf(id: string): BankQuestion | null {
  return QUESTION_BANK.find((q) => q.id === id) ?? null;
}

/** Fact key under which a guided-question answer is stored. */
export function bankFactKey(id: string): string {
  return `q-${id}`;
}

// ── Completeness score ──────────────────────────────────────────────────────

export interface ScoreInput {
  /** Active facts (category as stored). */
  factCategories: string[];
  /** Answered team questions + answered guided questions. */
  answered: number;
  documents: number;
  clientsTotal: number;
  clientsWithNotes: number;
}

export interface ScorePart {
  id: "facts" | "coverage" | "answers" | "documents" | "clients";
  label: string;
  points: number;
  max: number;
  detail: string;
}

export interface MemoryScore {
  total: number;
  parts: ScorePart[];
  areaCounts: Record<MemoryAreaId, number>;
}

export function computeMemoryScore(i: ScoreInput): MemoryScore {
  const areaCounts = Object.fromEntries(MEMORY_AREAS.map((a) => [a.id, 0])) as Record<MemoryAreaId, number>;
  for (const c of i.factCategories) areaCounts[areaOf(c)] += 1;
  const covered = MEMORY_AREAS.filter((a) => areaCounts[a.id] > 0).length;
  const n = i.factCategories.length;

  const parts: ScorePart[] = [
    {
      id: "facts",
      label: "Things you have told us",
      points: Math.min(35, Math.round(n * 1.75)),
      max: 35,
      detail: `${n} saved · 20 gives full marks`,
    },
    {
      id: "coverage",
      label: "Areas covered",
      points: Math.round((covered / MEMORY_AREAS.length) * 25),
      max: 25,
      detail: `${covered} of ${MEMORY_AREAS.length} areas have something`,
    },
    {
      id: "answers",
      label: "Questions answered",
      points: Math.min(15, i.answered * 3),
      max: 15,
      detail: `${i.answered} answered · 5 gives full marks`,
    },
    {
      id: "documents",
      label: "Documents on file",
      points: Math.min(10, i.documents * 2),
      max: 10,
      detail: `${i.documents} uploaded · 5 gives full marks`,
    },
    {
      id: "clients",
      label: "Clients with notes",
      points: i.clientsTotal > 0 ? Math.round((i.clientsWithNotes / i.clientsTotal) * 15) : 0,
      max: 15,
      detail: i.clientsTotal > 0 ? `${i.clientsWithNotes} of ${i.clientsTotal} clients have notes` : "No clients yet",
    },
  ];
  return { total: parts.reduce((s, p) => s + p.points, 0), parts, areaCounts };
}

// ── Flexible import parsing (paste or file) ─────────────────────────────────

export interface ImportFact {
  category: string;
  factKey: string;
  value: string;
}

function stripBullet(line: string): string {
  return line.replace(/^\s*(?:[-*•–]|\d+[.)])\s+/, "").trim();
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function areaFromText(t: string): MemoryAreaId | null {
  const s = t.toLowerCase().replace(/[^a-z ]/g, "").trim();
  if (!s) return null;
  const hit = MEMORY_AREAS.find((a) => a.id === s || a.label.toLowerCase() === s);
  if (hit) return hit.id;
  if (s in LEGACY_AREA) return LEGACY_AREA[s];
  return null;
}

/**
 * Turn pasted text or a small file into facts the user can review.
 * Handles `key: value`, `area|key: value`, bullet sentences, markdown
 * headings that name an area, CSV (key,value[,area]) and simple JSON.
 */
export function parseImportText(
  text: string,
  defaultArea: string,
  filename = "",
): { facts: ImportFact[]; skipped: number } {
  const facts: ImportFact[] = [];
  let skipped = 0;
  const seen = new Set<string>();
  const push = (category: string, rawKey: string, rawValue: string) => {
    const value = rawValue.replace(/\s+/g, " ").trim().slice(0, 1000);
    let key = slugKey(rawKey);
    if (!key || value.length < 2) {
      skipped += 1;
      return;
    }
    if (facts.length >= 300) {
      skipped += 1;
      return;
    }
    let n = 2;
    const base = key;
    while (seen.has(key)) key = `${base.slice(0, 74)}-${n++}`;
    seen.add(key);
    facts.push({ category, factKey: key, value });
  };
  const body = text.replace(/^﻿/, "").trim();
  if (!body) return { facts, skipped };
  const lower = filename.toLowerCase();

  // JSON
  if (lower.endsWith(".json") || /^[[{]/.test(body)) {
    try {
      const data: unknown = JSON.parse(body);
      const visit = (k: string, v: unknown, cat: string) => {
        if (typeof v === "string" || typeof v === "number") push(cat, k, String(v));
        else if (Array.isArray(v)) v.forEach((x, idx) => visit(`${k}-${idx + 1}`, x, cat));
        else if (v && typeof v === "object") {
          const o = v as Record<string, unknown>;
          if (typeof o.value === "string" || typeof o.text === "string" || typeof o.memory === "string") {
            const val = String(o.value ?? o.text ?? o.memory);
            const c = typeof o.category === "string" ? (areaFromText(o.category) ?? cat) : cat;
            const kk = String(o.key ?? o.title ?? o.name ?? val.split(/\s+/).slice(0, 6).join(" "));
            push(c, kk, val);
          } else for (const [kk, vv] of Object.entries(o)) visit(kk, vv, areaFromText(kk) ?? cat);
        }
      };
      if (Array.isArray(data)) {
        data.forEach((x, idx) => {
          if (typeof x === "string") push(defaultArea, x.split(/\s+/).slice(0, 6).join(" "), x);
          else visit(`item-${idx + 1}`, x, defaultArea);
        });
      } else visit("item", data, defaultArea);
      return { facts, skipped };
    } catch {
      /* fall through to plain text */
    }
  }

  const lines = body.split(/\r?\n/);

  // CSV
  const csvLike =
    lower.endsWith(".csv") ||
    (lines.length > 1 && lines.slice(0, 3).every((l) => l.includes(",") && !l.includes(":")));
  if (csvLike) {
    const rows = lines.filter((l) => l.trim()).map(splitCsvLine);
    const head = rows[0].map((h) => h.toLowerCase());
    const hasHeader = head.some((h) => ["key", "title", "name", "question", "topic"].includes(h)) && head.some((h) => ["value", "answer", "text", "memory", "note", "notes"].includes(h));
    const ki = hasHeader ? head.findIndex((h) => ["key", "title", "name", "question", "topic"].includes(h)) : 0;
    const vi = hasHeader ? head.findIndex((h) => ["value", "answer", "text", "memory", "note", "notes"].includes(h)) : 1;
    const ci = hasHeader ? head.findIndex((h) => ["category", "area", "type"].includes(h)) : 2;
    for (const r of hasHeader ? rows.slice(1) : rows) {
      const val = r[vi] ?? "";
      if (rows[0].length === 1) {
        push(defaultArea, (r[0] ?? "").split(/\s+/).slice(0, 6).join(" "), r[0] ?? "");
        continue;
      }
      const cat = ci >= 0 && r[ci] ? (areaFromText(r[ci]) ?? defaultArea) : defaultArea;
      push(cat, r[ki] ?? "", val);
    }
    return { facts, skipped };
  }

  // Plain text
  let area: string = defaultArea;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const heading = line.match(/^#{1,4}\s+(.*)$/) ?? line.match(/^\*\*(.+?)\*\*:?$/);
    if (heading) {
      const a = areaFromText(heading[1]);
      if (a) area = a;
      continue;
    }
    const content = stripBullet(line);
    if (content.length < 6) {
      skipped += 1;
      continue;
    }
    const colon = content.indexOf(":");
    const eq = content.indexOf("=");
    const sepAt = colon >= 0 && (eq < 0 || colon < eq) ? colon : eq;
    if (sepAt > 0 && sepAt <= 70) {
      let head = content.slice(0, sepAt).trim();
      const val = content.slice(sepAt + 1).trim();
      let cat = area;
      const pipe = head.indexOf("|");
      if (pipe >= 0) {
        const a = areaFromText(head.slice(0, pipe));
        if (a) {
          cat = a;
          head = head.slice(pipe + 1).trim();
        }
      }
      head = head.replace(/\*\*/g, "");
      if (head.split(/\s+/).length <= 9 && val) {
        push(cat, head, val.replace(/\*\*/g, ""));
        continue;
      }
    }
    const plain = content.replace(/\*\*/g, "");
    push(area, plain.split(/\s+/).slice(0, 6).join(" "), plain);
  }
  return { facts, skipped };
}

/**
 * How a stored fact should be shown. Guided-question answers are stored as
 * "<question> — <answer>" under key q-<id>; show the question as the title.
 */
export function displayFact(f: { factKey: string; value: string }): { title: string; value: string; guided: boolean } {
  if (f.factKey.startsWith("q-")) {
    const bank = bankQuestionOf(f.factKey.slice(2));
    if (bank) {
      const prefix = `${bank.text} — `;
      return { title: bank.text, value: f.value.startsWith(prefix) ? f.value.slice(prefix.length) : f.value, guided: true };
    }
  }
  return { title: humanizeKey(f.factKey), value: f.value, guided: false };
}
