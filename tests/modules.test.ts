import { describe, expect, it } from "vitest";

import {
  parseMemoryImport,
  summariseImport,
  rollupWhatWeKnow,
  MEMORY_CATEGORIES,
} from "@/lib/memory";
import {
  evalCell,
  displayValue,
  cellsToCsv,
  colLetter,
  colIndex,
  cellId,
  GRID_ROWS,
  GRID_COLS,
} from "@/lib/sheets";
import {
  matchAutomations,
  recipeOf,
  AUTOMATION_RECIPES,
  type AutomationRecord,
} from "@/lib/automations";
import { AI_EMPLOYEES, teamCreditPrice, employeeOf } from "@/lib/ai-team";
import { READY_SKILLS, skillOf, taughtToLine, categoryLabel } from "@/lib/skills";
import { parseCellsJson, MAX_CELLS_JSON_BYTES } from "@/lib/sheets-server";

// ── Memory import ────────────────────────────────────────────────────────────

describe("parseMemoryImport", () => {
  it("parses key: value lines", () => {
    const { facts, skipped } = parseMemoryImport("payment-terms: Net-30\ndeploy: Tuesdays");
    expect(facts).toEqual([
      { category: "general", factKey: "payment-terms", value: "Net-30" },
      { category: "general", factKey: "deploy", value: "Tuesdays" },
    ]);
    expect(skipped).toBe(0);
  });

  it("parses category|key: value and key = value", () => {
    const { facts } = parseMemoryImport(
      "clients|acme: PO required\ndelivery|window = Tue/Thu",
    );
    expect(facts[0]).toEqual({ category: "clients", factKey: "acme", value: "PO required" });
    expect(facts[1]).toEqual({ category: "delivery", factKey: "window", value: "Tue/Thu" });
  });

  it("skips unknown categories to general", () => {
    const { facts } = parseMemoryImport("weird|x: y");
    expect(facts[0].category).toBe("general");
    expect(facts[0].factKey).toBe("weird-x");
  });

  it("counts skipped lines without separators or empty sides", () => {
    const { facts, skipped } = parseMemoryImport("no separator here\n\n: no key\nkey: \nok: fine");
    expect(facts).toEqual([{ category: "general", factKey: "ok", value: "fine" }]);
    expect(skipped).toBe(3);
  });

  it("normalises keys: spaces to dashes, lowercase, trimmed", () => {
    const { facts } = parseMemoryImport("Payment Terms Policy: Net-30");
    expect(facts[0].factKey).toBe("payment-terms-policy");
  });

  it("returns empty for empty text", () => {
    expect(parseMemoryImport("")).toEqual({ facts: [], skipped: 0 });
  });
});

describe("summariseImport / rollupWhatWeKnow", () => {
  it("summarises counts by category with skips", () => {
    const { facts } = parseMemoryImport("a: 1\nclients|b: 2\nbad line");
    const s = summariseImport(facts, 1);
    expect(s).toContain("2 facts imported");
    expect(s).toContain("1 clients");
    expect(s).toContain("1 line skipped");
  });

  it("rolls up grouped summary capped at 3 per category", () => {
    const out = rollupWhatWeKnow([
      { category: "general", factKey: "g1", value: "one" },
      { category: "general", factKey: "g2", value: "two" },
      { category: "general", factKey: "g3", value: "three" },
      { category: "general", factKey: "g4", value: "four" },
      { category: "finance", factKey: "f1", value: "money" },
    ]);
    expect(out).toContain("General — g1: one; g2: two; g3: three.");
    expect(out).not.toContain("g4");
    expect(out).toContain("Finance — f1: money.");
  });

  it("returns empty string for no facts", () => {
    expect(rollupWhatWeKnow([])).toBe("");
  });

  it("exposes the canonical category list", () => {
    expect(MEMORY_CATEGORIES).toContain("clients");
  });
});

// ── Sheets ───────────────────────────────────────────────────────────────────

describe("sheets addressing", () => {
  it("converts letters and indices", () => {
    expect(colLetter(0)).toBe("A");
    expect(colLetter(25)).toBe("Z");
    expect(colIndex("a")).toBe(0);
    expect(colIndex("Z")).toBe(25);
    expect(cellId(0, 0)).toBe("A1");
    expect(cellId(9, 2)).toBe("C10");
  });

  it("grid is 26 x 100", () => {
    expect(GRID_COLS).toBe(26);
    expect(GRID_ROWS).toBe(100);
  });
});

describe("evalCell", () => {
  it("returns plain values untouched", () => {
    expect(evalCell({}, "hello")).toBe("hello");
    expect(evalCell({}, "")).toBe("");
  });

  it("evaluates SUM over a range", () => {
    const cells = { A1: { v: "1" }, A2: { v: "2" }, A3: { v: "3.5" } };
    expect(evalCell(cells, "=SUM(A1:A3)")).toBe("6.5");
  });

  it("ignores non-numeric cells in ranges", () => {
    const cells = { A1: { v: "5" }, A2: { v: "n/a" } };
    expect(evalCell(cells, "=SUM(A1:A2)")).toBe("5");
    expect(evalCell(cells, "=COUNT(A1:A2)")).toBe("1");
  });

  it("evaluates AVG, MIN, MAX", () => {
    const cells = { A1: { v: "10" }, A2: { v: "20" }, A3: { v: "30" } };
    expect(evalCell(cells, "=AVG(A1:A3)")).toBe("20");
    expect(evalCell(cells, "=MIN(A1:A3)")).toBe("10");
    expect(evalCell(cells, "=MAX(A1:A3)")).toBe("30");
  });

  it("follows direct cell references", () => {
    const cells = { A1: { v: "42" }, B1: { v: "=A1" } };
    expect(evalCell(cells, "=B1")).toBe("42");
  });

  it("detects reference loops", () => {
    const cells = { A1: { v: "=A1" }, B1: { v: "=B2" }, B2: { v: "=B1" } };
    expect(evalCell(cells, "=A1")).toBe("#LOOP");
    expect(evalCell(cells, "=B1")).toBe("#LOOP");
  });

  it("evaluates arithmetic with refs", () => {
    const cells = { A1: { v: "6" }, A2: { v: "7" } };
    expect(evalCell(cells, "=A1*A2+1")).toBe("43");
  });

  it("returns #ERR for garbage formulas", () => {
    expect(evalCell({}, "=SUM(bogus)")).toBe("#ERR");
  });

  it("AVG of empty range is #DIV/0", () => {
    expect(evalCell({}, "=AVG(A1:A5)")).toBe("#DIV/0");
  });
});

describe("displayValue", () => {
  it("formats INR", () => {
    expect(displayValue("150000", { format: "inr" })).toMatch(/^₹1,50,000$/);
  });
  it("formats percent", () => {
    expect(displayValue("0.125", { format: "percent", decimals: 1 })).toBe("12.5%");
  });
  it("formats numbers with decimals", () => {
    expect(displayValue("3.14159", { format: "number", decimals: 2 })).toBe("3.14");
  });
  it("formats dates to ISO date", () => {
    expect(displayValue("2026-10-02T10:00:00Z", { format: "date" })).toBe("2026-10-02");
  });
  it("passes through text", () => {
    expect(displayValue("plain")).toBe("plain");
  });
});

describe("cellsToCsv", () => {
  it("exports values with formulas resolved", () => {
    const csv = cellsToCsv({ A1: { v: "1" }, A2: { v: "2" }, A3: { v: "=SUM(A1:A2)" } }, 4, 3);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("1,,");
    expect(lines[2]).toBe("3,,");
    expect(lines).toHaveLength(3); // trailing empty row trimmed
  });

  it("quotes fields containing commas/quotes", () => {
    const csv = cellsToCsv({ A1: { v: 'say "hi", ok' } }, 1, 2);
    expect(csv).toBe('"say ""hi"", ok",');
  });
});

describe("parseCellsJson (server)", () => {
  it("accepts valid cells and drops malformed keys", () => {
    const out = parseCellsJson(JSON.stringify({ A1: { v: "x" }, Z99: { v: "y" }, "!!": { v: "z" }, B1: "nope" }));
    expect(Object.keys(out).sort()).toEqual(["A1", "Z99"]);
  });

  it("rejects oversized payloads", () => {
    const big = JSON.stringify({ A1: { v: "x".repeat(MAX_CELLS_JSON_BYTES) } });
    expect(() => parseCellsJson(big)).toThrow(/too large/);
  });

  it("rejects corrupt JSON", () => {
    expect(() => parseCellsJson("{not json")).toThrow(/corrupt/);
  });

  it("clamps long values", () => {
    const out = parseCellsJson(JSON.stringify({ A1: { v: "x".repeat(9000) } }));
    expect(out.A1?.v?.length).toBe(5000);
  });
});

// ── Automations ──────────────────────────────────────────────────────────────

describe("matchAutomations", () => {
  const base: AutomationRecord = {
    id: "a1",
    enabled: true,
    trigger: "invoice.paid",
    notifyFounders: true,
    notifyClient: false,
    createTask: true,
    taskTitle: "Reconcile",
    watchScope: "ALL",
    watchClientId: null,
    watchProjectId: null,
  };
  const event = {
    trigger: "invoice.paid" as const,
    orgId: "org1",
    clientId: "c1",
    projectId: "p1",
    subjectTitle: "INV-1",
  };

  it("fires matching automation with ordered effects", () => {
    const plans = matchAutomations([base], event);
    expect(plans).toHaveLength(1);
    expect(plans[0].effects).toEqual(["notify_founders", "create_task"]);
    expect(plans[0].taskTitle).toBe("Reconcile");
  });

  it("skips disabled automations", () => {
    expect(matchAutomations([{ ...base, enabled: false }], event)).toHaveLength(0);
  });

  it("skips different triggers", () => {
    expect(matchAutomations([base], { ...event, trigger: "proposal.signed" })).toHaveLength(0);
  });

  it("respects CLIENT watch scope", () => {
    const scoped = { ...base, watchScope: "CLIENT", watchClientId: "c1" };
    expect(matchAutomations([scoped], event)).toHaveLength(1);
    expect(matchAutomations([{ ...scoped, watchClientId: "other" }], event)).toHaveLength(0);
  });

  it("respects PROJECT watch scope", () => {
    const scoped = { ...base, watchScope: "PROJECT", watchProjectId: "p1" };
    expect(matchAutomations([scoped], event)).toHaveLength(1);
    expect(matchAutomations([{ ...scoped, watchProjectId: "other" }], event)).toHaveLength(0);
  });

  it("drops plans with no effects", () => {
    expect(matchAutomations([{ ...base, notifyFounders: false, createTask: false }], event)).toHaveLength(0);
  });

  it("matches multiple automations independently", () => {
    const second: AutomationRecord = {
      ...base,
      id: "a2",
      notifyFounders: false,
      notifyClient: true,
      createTask: false,
    };
    const plans = matchAutomations([base, second], event);
    expect(plans.map((p) => p.automationId)).toEqual(["a1", "a2"]);
  });
});

describe("automation catalog integrity", () => {
  it("every recipe has at least one effect and known trigger", () => {
    const triggers = new Set(["invoice.paid", "proposal.signed", "project.created", "milestone.completed", "task.completed"]);
    for (const r of AUTOMATION_RECIPES) {
      expect(r.effects.length).toBeGreaterThan(0);
      expect(triggers.has(r.trigger)).toBe(true);
      if (r.effects.includes("create_task")) {
        expect(r.taskTitle).toBeTruthy();
      }
    }
  });

  it("recipeOf finds by id and returns null otherwise", () => {
    expect(recipeOf("money-notify-payment")?.title).toContain("payment lands");
    expect(recipeOf("nope")).toBeNull();
  });
});

// ── AI team + skills ─────────────────────────────────────────────────────────

describe("AI team", () => {
  it("has the five evidenced employees", () => {
    expect(AI_EMPLOYEES.map((e) => e.key)).toEqual(["aria", "vikram", "maya", "leo", "sage"]);
  });

  it("teamCreditPrice sums enabled employees only", () => {
    expect(teamCreditPrice([])).toBe(0);
    expect(teamCreditPrice(["aria", "leo"])).toBe(0); // included employees
    expect(teamCreditPrice(["vikram", "maya", "sage"])).toBe(70);
    expect(teamCreditPrice(["vikram", "ghost"])).toBe(20);
  });

  it("employeeOf resolves and rejects", () => {
    expect(employeeOf("aria")?.role).toBe("Project Manager");
    expect(employeeOf("nobody")).toBeNull();
  });
});

describe("skills", () => {
  it("covers all six categories", () => {
    const cats = new Set(READY_SKILLS.map((s) => s.category));
    expect(cats.size).toBe(6);
  });

  it("skillOf and categoryLabel resolve", () => {
    expect(skillOf("client-onboarding")?.taughtTo).toContain("maya");
    expect(categoryLabel("FINANCE")).toBe("Finance");
    expect(categoryLabel("UNKNOWN")).toBe("UNKNOWN");
    expect(skillOf("missing")).toBeNull();
  });

  it("taughtToLine names employees", () => {
    expect(taughtToLine(["aria", "leo"])).toBe("Taught to Aria, Leo");
    expect(taughtToLine([])).toBe("Taught to nobody yet");
  });
});
