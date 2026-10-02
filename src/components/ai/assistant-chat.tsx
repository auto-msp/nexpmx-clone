"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { askAssistant } from "@/app/actions/assistant";
import { Icon } from "@/components/kit-icons";
import { Badge, Button, cx } from "@/components/ui";

interface Source {
  kind: string;
  title: string;
  snippet: string;
}
interface Turn {
  id: number;
  question: string;
  state: "pending" | "done" | "error";
  answer?: string;
  sources?: Source[];
  credits?: number;
}

export function AssistantChat({
  initialQuestion,
  clientNames,
  creditsUsed,
  creditsLimit,
}: {
  initialQuestion?: string;
  clientNames: string[];
  creditsUsed: number;
  creditsLimit: number;
}) {
  const [input, setInput] = useState(initialQuestion ?? "");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [spent, setSpent] = useState(0);
  const [, start] = useTransition();
  const nextId = useRef(1);
  const bottom = useRef<HTMLDivElement>(null);
  const ran = useRef(false);

  const ask = (raw: string) => {
    const question = raw.trim();
    if (question.length < 3) return;
    const id = nextId.current++;
    setTurns((t) => [...t, { id, question, state: "pending" }]);
    setInput("");
    start(async () => {
      const r = await askAssistant(question).catch(() => ({ ok: false as const, error: "Could not reach the server. Try again." }));
      setTurns((t) =>
        t.map((x) =>
          x.id !== id
            ? x
            : r.ok
              ? { ...x, state: "done", answer: r.answer, sources: r.sources, credits: r.creditsUsed }
              : { ...x, state: "error", answer: r.error },
        ),
      );
      if (r.ok) setSpent((s) => s + r.creditsUsed);
    });
  };

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (initialQuestion && initialQuestion.trim().length >= 3) ask(initialQuestion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (turns.length) bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  const starters: Array<{ icon: string; title: string; hint: string; prompts: string[] }> = [
    {
      icon: "user",
      title: "Ask about a client",
      hint: "Pull together what your workspace knows about one client.",
      prompts: clientNames.length
        ? clientNames.slice(0, 2).map((n) => `What do we know about ${n}?`)
        : ["Which clients need a follow-up?"],
    },
    {
      icon: "rupee",
      title: "Check my numbers",
      hint: "Receivables, overdue invoices and recent collections.",
      prompts: ["How much is overdue and who owes it?", "How much cash did we collect lately?"],
    },
    {
      icon: "calendar",
      title: "Plan my week",
      hint: "What is due soon and what could slip.",
      prompts: ["What is due this week?", "Which projects are at risk of slipping?"],
    },
  ];

  const remaining = Math.max(0, creditsLimit - creditsUsed - spent);

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {starters.map((s) => (
          <section key={s.title} className="flex flex-col rounded-[var(--radius-card)] border border-border bg-surface p-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/15 text-brand">
              <Icon name={s.icon} className="h-4 w-4" />
            </span>
            <h2 className="mt-3 text-sm font-semibold">{s.title}</h2>
            <p className="mt-1 flex-1 text-sm text-muted">{s.hint}</p>
            <div className="mt-4 flex flex-col gap-2">
              {s.prompts.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => ask(p)}
                  className="rounded-[var(--radius-control)] border border-border bg-surface-2 px-3 py-2 text-left text-xs text-text transition-colors hover:border-brand"
                >
                  {p}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className="mt-6 rounded-[var(--radius-card)] border border-border bg-surface" aria-label="Conversation">
        <div className="max-h-[32rem] min-h-40 space-y-5 overflow-y-auto p-5" aria-live="polite">
          {turns.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">Ask a question below, or tap one of the starters. Answers come from your own clients, projects, invoices, decisions and saved memory.</p>
          ) : (
            turns.map((t) => (
              <div key={t.id} className="space-y-2">
                <div className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-brand/15 px-4 py-2 text-sm">{t.question}</p>
                </div>
                <div className="flex">
                  <div
                    className={cx(
                      "max-w-[92%] rounded-2xl rounded-bl-sm border px-4 py-3 text-sm",
                      t.state === "error" ? "border-danger/40 bg-danger/10 text-danger" : "border-border bg-surface-2",
                    )}
                  >
                    {t.state === "pending" ? (
                      <span className="inline-flex items-center gap-2 text-muted">
                        <Icon name="sparkle" className="h-4 w-4 animate-pulse text-brand" /> Looking through your workspace…
                      </span>
                    ) : (
                      <>
                        <p className="whitespace-pre-wrap leading-relaxed">{t.answer}</p>
                        {t.state === "done" && t.sources && t.sources.length > 0 ? (
                          <div className="mt-3 border-t border-border pt-3">
                            <h3 className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Sources</h3>
                            <ul className="mt-1.5 space-y-1 text-xs text-muted">
                              {t.sources.map((s, i) => (
                                <li key={i}>
                                  <span className="font-medium text-text">[{s.kind}]</span> {s.title}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {t.state === "done" && (t.credits ?? 0) > 0 ? (
                          <div className="mt-2">
                            <Badge tone="brand">+{t.credits} credit{t.credits === 1 ? "" : "s"}</Badge>
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={bottom} />
        </div>
        <form
          className="flex flex-col gap-2 border-t border-border p-4 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
        >
          <label className="flex-1">
            <span className="sr-only">Your question</span>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={300}
              placeholder="e.g. What did we decide about pricing for our biggest client?"
              className="w-full rounded-[var(--radius-control)] border border-border bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-muted/60 focus:border-brand focus:outline-none"
            />
          </label>
          <Button type="submit" disabled={input.trim().length < 3}>
            <Icon name="send" /> Ask
          </Button>
        </form>
        <p className="border-t border-border px-4 py-2 text-[11px] text-muted">
          {remaining.toLocaleString("en-IN")} of {creditsLimit.toLocaleString("en-IN")} AI credits left this cycle.
        </p>
      </section>
    </div>
  );
}
