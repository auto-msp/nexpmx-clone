"use client";

import { useRef, useState } from "react";
import type { ActionResult } from "@/lib/action";
import { ActionForm } from "@/components/kit-client";
import { Icon } from "@/components/kit-icons";
import { Button, cx } from "@/components/ui";
import { Input, Select, Textarea } from "@/components/ai/fields";
import { MEMORY_AREAS, areaOf, parseImportText } from "@/lib/memory";

type Act = (fd: FormData) => Promise<ActionResult>;

interface Row {
  id: number;
  include: boolean;
  category: string;
  factKey: string;
  value: string;
}

const SOURCES = [
  {
    id: "chatgpt",
    label: "ChatGPT",
    steps: [
      "Open a new chat in ChatGPT.",
      "Ask: \"List everything you have learned about me and my business, one item per line.\"",
      "Copy the reply and paste it below, or save it as a text file and choose it.",
    ],
  },
  {
    id: "claude",
    label: "Claude",
    steps: [
      "Open a new conversation in Claude.",
      "Ask: \"Summarise what you know about me, my clients and how I work, as a bulleted list.\"",
      "Copy the reply and paste it below, or save it as a text file and choose it.",
    ],
  },
  {
    id: "gemini",
    label: "Gemini",
    steps: [
      "Open a new chat in Gemini.",
      "Ask: \"Write down everything you remember about me and my work, one point per line.\"",
      "Copy the reply and paste it below, or save it as a text file and choose it.",
    ],
  },
] as const;

export function ImportFlow({ importAction, canWrite }: { importAction: Act; canWrite: boolean }) {
  const [source, setSource] = useState<(typeof SOURCES)[number]["id"]>("chatgpt");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [area, setArea] = useState("ways");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const active = SOURCES.find((s) => s.id === source) ?? SOURCES[0];

  const readFile = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    if (f.size > 1_000_000) {
      setError("That file is over 1 MB. Split it up or paste the important part.");
      return;
    }
    if (!/\.(txt|md|csv|json)$/i.test(f.name)) {
      setError("Use a text file: .txt, .md, .csv or .json.");
      return;
    }
    setText(await f.text());
    setFileName(f.name);
  };

  const review = () => {
    setError(null);
    const { facts, skipped: s } = parseImportText(text, area, fileName);
    if (facts.length === 0) {
      setError("Nothing readable found. Paste a list with one item per line, or try a different file.");
      return;
    }
    setRows(facts.map((f, i) => ({ id: i, include: true, category: areaOf(f.category), factKey: f.factKey, value: f.value })));
    setSkipped(s);
  };

  const chosen = rows?.filter((r) => r.include && r.factKey.trim() && r.value.trim()) ?? [];
  const patch = (id: number, p: Partial<Row>) => setRows((rs) => rs?.map((r) => (r.id === id ? { ...r, ...p } : r)) ?? null);

  const areaSelect = (id: string) => (
    <Select id={id} value={area} onChange={(e) => setArea(e.target.value)} aria-label="What is it about?">
      {MEMORY_AREAS.map((a) => (
        <option key={a.id} value={a.id}>
          {a.label}
        </option>
      ))}
    </Select>
  );

  const fileButton = (label: string) => (
    <Button type="button" variant="secondary" className="w-full" onClick={() => fileRef.current?.click()} disabled={!canWrite}>
      <Icon name="upload" /> {label}
    </Button>
  );

  if (rows) {
    return (
      <div className="rounded-[var(--radius-card)] border border-border bg-surface p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Review before importing</h2>
            <p className="text-xs text-muted">
              {chosen.length} of {rows.length} selected{skipped ? ` · ${skipped} line${skipped === 1 ? "" : "s"} skipped` : ""}. Change anything that looks off.
            </p>
          </div>
          <Button type="button" variant="ghost" onClick={() => setRows(null)}>
            Start over
          </Button>
        </div>
        <ActionForm action={importAction} submitLabel={`Import ${chosen.length} item${chosen.length === 1 ? "" : "s"}`} pendingLabel="Importing…" resetOnSuccess={false}>
          <input type="hidden" name="payload" value={JSON.stringify(chosen.map(({ category, factKey, value }) => ({ category, factKey, value })))} />
          <ul className="max-h-[32rem] space-y-3 overflow-y-auto pr-1">
            {rows.map((r) => (
              <li key={r.id} className={cx("rounded-[var(--radius-control)] border border-border p-3", r.include ? "bg-surface-2/50" : "opacity-50")}>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-2 text-xs text-muted">
                    <input type="checkbox" checked={r.include} onChange={(e) => patch(r.id, { include: e.target.checked })} className="h-4 w-4 accent-brand" />
                    Include
                  </label>
                  <Select value={r.category} onChange={(e) => patch(r.id, { category: e.target.value })} aria-label="Area" className="!w-auto text-xs">
                    {MEMORY_AREAS.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label}
                      </option>
                    ))}
                  </Select>
                  <Input value={r.factKey} onChange={(e) => patch(r.id, { factKey: e.target.value })} aria-label="Title" maxLength={80} className="!w-auto min-w-0 flex-1 text-xs" />
                </div>
                <Textarea value={r.value} onChange={(e) => patch(r.id, { value: e.target.value })} aria-label="Value" maxLength={1000} className="mt-2 !min-h-16 text-sm" />
              </li>
            ))}
          </ul>
        </ActionForm>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <input ref={fileRef} type="file" accept=".txt,.md,.csv,.json,text/plain" className="sr-only" aria-label="Choose a file" onChange={(e) => void readFile(e.target.files?.[0])} />

      <section className="rounded-[var(--radius-card)] border border-border bg-surface p-5">
        <h2 className="text-base font-semibold">Paste from another assistant</h2>
        <div className="mt-3 inline-flex rounded-full border border-border bg-surface-2 p-1" role="tablist">
          {SOURCES.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={source === s.id}
              onClick={() => setSource(s.id)}
              className={cx("rounded-full px-3 py-1 text-xs font-medium", source === s.id ? "bg-brand text-white" : "text-muted hover:text-text")}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="mt-4 rounded-[var(--radius-control)] border border-border bg-surface-2/60 p-4">
          <h3 className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Where to find it</h3>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted">
            {active.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
        <label className="mt-4 block">
          <span className="mb-1.5 block text-xs font-medium text-muted">Paste it here</span>
          <Textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setFileName("");
            }}
            maxLength={100000}
            placeholder={"We never discount below 15% margin\nClients pay within 15 days, reminders go out on day 10\nclients|Acme: prefers calls over email"}
            className="min-h-40"
            disabled={!canWrite}
          />
        </label>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">File one-line items under</span>
            {areaSelect("area-paste")}
          </label>
          <div className="flex items-end">{fileButton(fileName ? `Chosen: ${fileName}` : "Choose a file instead")}</div>
        </div>
        <p className="mt-3 text-xs text-muted">
          Nothing is saved until you review the list on the next step. Items are stored only in your workspace and are never shared outside it.
        </p>
      </section>

      <section className="rounded-[var(--radius-card)] border border-border bg-surface p-5">
        <h2 className="text-base font-semibold">Or upload a document</h2>
        <p className="mt-1 text-sm text-muted">A process note, a list of rules or a spreadsheet export. Each line or row becomes one item you can review.</p>
        <label className="mt-4 block">
          <span className="mb-1.5 block text-xs font-medium text-muted">What is it about?</span>
          {areaSelect("area-doc")}
        </label>
        <div className="mt-3">{fileButton(fileName ? `Chosen: ${fileName}` : "Choose a document")}</div>
        <p className="mt-2 text-xs text-muted">Text formats only: .txt, .md, .csv and .json. Up to 1 MB.</p>
      </section>

      {error ? (
        <p role="alert" className="rounded-[var(--radius-control)] border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="button" onClick={review} disabled={!canWrite || text.trim().length < 3}>
          Review items <Icon name="chevronRight" />
        </Button>
      </div>
      {!canWrite ? <p className="text-xs text-muted">Your role can read the memory but not add to it.</p> : null}
    </div>
  );
}
