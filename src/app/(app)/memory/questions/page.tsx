import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { pageContext } from "@/lib/page";
import { relTime, sp } from "@/lib/format";
import { PageHeader, EmptyPanel, Panel } from "@/components/kit";
import { ActionButton, ActionForm } from "@/components/kit-client";
import { Badge, cx } from "@/components/ui";
import { FieldLabel, Input, Select, Textarea } from "@/components/ai/fields";
import { MEMORY_AREAS, QUESTION_BANK, areaLabel, bankFactKey, displayFact, isAreaId } from "@/lib/memory";
import { answerBankQuestion, answerMemoryQuestion, askMemoryQuestion, deleteMemoryQuestion } from "@/app/actions/memory";

export const metadata: Metadata = { title: "Questions", robots: { index: false } };

function href(tab: string, area: string, i = 0) {
  const p = new URLSearchParams();
  if (tab !== "open") p.set("tab", tab);
  if (area) p.set("area", area);
  if (i) p.set("i", String(i));
  const s = p.toString();
  return s ? `/memory/questions?${s}` : "/memory/questions";
}

export default async function QuestionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const tab = sp(params.tab) === "answered" ? "answered" : "open";
  const areaParam = sp(params.area);
  const area = isAreaId(areaParam) ? areaParam : "";
  const idx = Math.max(0, parseInt(sp(params.i), 10) || 0);
  const { orgId, canWrite } = await pageContext("memory:write");

  const [openQs, answeredQs, guidedFacts] = await Promise.all([
    prisma.memoryQuestion.findMany({ where: { orgId, state: "OPEN" }, orderBy: { createdAt: "asc" }, take: 50 }),
    prisma.memoryQuestion.findMany({ where: { orgId, state: "ANSWERED" }, orderBy: { updatedAt: "desc" }, take: 50 }),
    prisma.memoryFact.findMany({ where: { orgId, factKey: { startsWith: "q-" } }, orderBy: { updatedAt: "desc" }, select: { id: true, factKey: true, value: true, category: true, status: true, updatedAt: true } }),
  ]);
  const answeredBank = new Set(guidedFacts.map((f) => f.factKey));
  const remaining = QUESTION_BANK.filter((b) => !answeredBank.has(bankFactKey(b.id)) && (!area || b.area === area));
  const current = remaining.length ? remaining[idx % remaining.length] : null;
  const position = remaining.length ? (idx % remaining.length) + 1 : 0;
  const answeredCount = answeredQs.length + guidedFacts.filter((f) => f.status === "ACTIVE").length;

  const areaOptions = MEMORY_AREAS.map((a) => (
    <option key={a.id} value={a.id}>{a.label}</option>
  ));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="What we still do not know"
        subtitle="A few questions at a time. Short answers in your own words are enough, and there is always another batch."
      />

      <div className="mb-5 inline-flex rounded-full border border-border bg-surface-2 p-1" role="tablist">
        {(
          [
            ["open", `To answer (${remaining.length + openQs.length})`],
            ["answered", `Answered (${answeredCount})`],
          ] as const
        ).map(([id, label]) => (
          <Link
            key={id}
            href={href(id, area)}
            role="tab"
            aria-selected={tab === id}
            className={cx("rounded-full px-4 py-1.5 text-sm font-medium", tab === id ? "bg-brand text-white" : "text-muted hover:text-text")}
          >
            {label}
          </Link>
        ))}
      </div>

      {tab === "open" ? (
        <div className="space-y-6">
          <nav className="flex flex-wrap gap-2" aria-label="Question areas">
            {[{ id: "", label: "All areas" }, ...MEMORY_AREAS].map((c) => (
              <Link
                key={c.id || "all"}
                href={href("open", c.id)}
                aria-current={area === c.id ? "true" : undefined}
                className={cx(
                  "rounded-full border px-3 py-1 text-xs font-medium",
                  area === c.id ? "border-brand bg-brand/15 text-brand" : "border-border text-muted hover:text-text",
                )}
              >
                {c.label}
              </Link>
            ))}
          </nav>

          {current ? (
            <section className="rounded-[var(--radius-card)] border border-border bg-surface p-6" aria-label="Guided question">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-brand">{areaLabel(current.area)}</span>
                <span className="text-xs text-muted">{position} of {remaining.length}</span>
              </div>
              <h2 className="mt-3 text-lg font-semibold leading-snug">{current.text}</h2>
              {canWrite ? (
                <ActionForm action={answerBankQuestion} submitLabel="Save and next" pendingLabel="Saving…" className="mt-4" footerClassName="justify-between">
                  <input type="hidden" name="bankId" value={current.id} />
                  <label>
                    <span className="sr-only">Your answer</span>
                    <Textarea
                      name="answer"
                      required
                      minLength={2}
                      maxLength={1000}
                      placeholder="In your own words. Half a sentence is worth more than nothing."
                      className="min-h-28"
                    />
                  </label>
                </ActionForm>
              ) : null}
              <div className="-mt-1 flex">
                <Link href={href("open", area, idx + 1)} className="text-xs text-muted hover:text-text">
                  Not this one →
                </Link>
              </div>
            </section>
          ) : (
            <EmptyPanel
              icon="check"
              title={area ? `You have covered every ${areaLabel(area).toLowerCase()} question` : "You have answered every suggested question"}
              hint="Add your own question for the team below, or import more from another assistant."
            />
          )}

          <Panel title={`Questions from your team (${openQs.length})`}>
            {openQs.length === 0 ? (
              <p className="text-sm text-muted">No open team questions. Ask one below and someone can answer it for the record.</p>
            ) : (
              <ul className="space-y-5">
                {openQs.map((q) => (
                  <li key={q.id} className="rounded-[var(--radius-control)] border border-border bg-surface-2/50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium">{q.question}</p>
                      {canWrite ? (
                        <ActionButton action={deleteMemoryQuestion} fields={{ id: q.id }} label="Remove question" icon="trash" variant="ghost" onlyIcon confirm="Remove this question?" />
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted">Asked {relTime(q.createdAt)}</p>
                    {canWrite ? (
                      <ActionForm action={answerMemoryQuestion} submitLabel="Save answer" className="mt-3">
                        <input type="hidden" name="id" value={q.id} />
                        <label>
                          <span className="sr-only">Answer</span>
                          <Textarea name="answer" required maxLength={2000} placeholder="Write the answer…" className="min-h-20" />
                        </label>
                        <label className="block">
                          <FieldLabel>File the answer under</FieldLabel>
                          <Select name="category" defaultValue="ways">{areaOptions}</Select>
                        </label>
                      </ActionForm>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {canWrite ? (
            <Panel title="Ask a question to the team">
              <ActionForm action={askMemoryQuestion} submitLabel="Ask the team">
                <label className="block">
                  <FieldLabel hint="Appears in the list above">Question</FieldLabel>
                  <Input name="question" required minLength={5} maxLength={300} placeholder="e.g. Who approves discounts above 10%?" />
                </label>
              </ActionForm>
            </Panel>
          ) : null}
        </div>
      ) : answeredCount === 0 ? (
        <EmptyPanel icon="help" title="Nothing answered yet" hint="Answers you give are saved to your memory and show up here." action={<Link href="/memory/questions" className="text-sm font-medium text-brand hover:underline">Start answering</Link>} />
      ) : (
        <div className="space-y-6">
          {answeredQs.length ? (
            <Panel title={`Team questions (${answeredQs.length})`}>
              <ul className="space-y-4">
                {answeredQs.map((q) => (
                  <li key={q.id}>
                    <p className="text-sm font-medium">{q.question}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{q.answer}</p>
                    <p className="mt-1 text-[11px] text-muted/80">Answered {relTime(q.updatedAt)}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
          {guidedFacts.filter((f) => f.status === "ACTIVE").length ? (
            <Panel title="Guided questions" action={<Link href="/memory/what-we-know" className="text-xs text-brand hover:underline">Edit in notes</Link>}>
              <ul className="space-y-4">
                {guidedFacts
                  .filter((f) => f.status === "ACTIVE")
                  .map((f) => {
                    const d = displayFact(f);
                    return (
                      <li key={f.id}>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">{d.title}</p>
                          <Badge tone="neutral">{areaLabel(f.category)}</Badge>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{d.value}</p>
                        <p className="mt-1 text-[11px] text-muted/80">Answered {relTime(f.updatedAt)}</p>
                      </li>
                    );
                  })}
              </ul>
            </Panel>
          ) : null}
        </div>
      )}
    </div>
  );
}
