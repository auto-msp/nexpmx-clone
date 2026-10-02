import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { getOrgContext } from "@/lib/tenancy";
import { prisma } from "@/lib/db";
import { canRead } from "@/lib/rbac";
import { Badge, Button, Card, EmptyState, Field, Input, SectionTitle, Textarea } from "@/components/ui";
import { askMemoryQuestion, answerMemoryQuestion, deleteMemoryQuestion } from "@/app/actions/memory";
import { SubmitButton } from "@/components/submit-button";

export const metadata: Metadata = { title: "Memory questions", robots: { index: false } };

export default async function MemoryQuestionsPage() {
  const session = await auth();
  const ctx = await getOrgContext(session!.user!.id);
  if (!canRead(ctx!.role)) throw new Error("Forbidden");

  const questions = await prisma.memoryQuestion.findMany({
    where: { orgId: ctx!.orgId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const open = questions.filter((q) => q.state === "OPEN");
  const answered = questions.filter((q) => q.state === "ANSWERED");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Memory questions</h1>
        <p className="mt-1 text-sm text-muted">
          Capture what your memory should eventually answer — then answer it once and it's remembered.
        </p>
      </div>

      <Card>
        <SectionTitle>Ask the memory a question</SectionTitle>
        <form action={askMemoryQuestion} className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-72 flex-1">
            <Field label="Question *">
              <Input
                name="question"
                required
                maxLength={300}
                placeholder="e.g. What is our standard payment term for retainers?"
              />
            </Field>
          </div>
          <SubmitButton pendingLabel="Asking…">Add question</SubmitButton>
        </form>
      </Card>

      <section aria-label="Open questions">
        <h2 className="text-lg font-semibold tracking-tight">Open ({open.length})</h2>
        {open.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="Nothing open" hint="All caught up — every question has an answer." />
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {open.map((q) => (
              <Card key={q.id}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium">{q.question}</p>
                  <form action={deleteMemoryQuestion}>
                    <input type="hidden" name="id" value={q.id} />
                    <Button variant="ghost" type="submit" className="px-2 py-1 text-xs">Dismiss</Button>
                  </form>
                </div>
                <form action={answerMemoryQuestion} className="mt-3 space-y-2">
                  <input type="hidden" name="id" value={q.id} />
                  <Field label="Answer">
                    <Textarea name="answer" required maxLength={2000} placeholder="Write the answer once — it becomes memory." className="min-h-16" />
                  </Field>
                  <Button type="submit" className="px-3 py-1.5 text-xs">Save answer</Button>
                </form>
                <p className="mt-2 text-xs text-muted">
                  asked {q.createdAt.toISOString().slice(0, 10)}
                </p>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section aria-label="Answered questions">
        <h2 className="text-lg font-semibold tracking-tight">Answered ({answered.length})</h2>
        {answered.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No answered questions yet.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {answered.map((q) => (
              <Card key={q.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="success">answered</Badge>
                  <p className="text-sm font-medium">{q.question}</p>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{q.answer}</p>
                <div className="mt-2 flex items-center gap-3">
                  <p className="text-xs text-muted">answered {q.updatedAt.toISOString().slice(0, 10)}</p>
                  <form action={deleteMemoryQuestion}>
                    <input type="hidden" name="id" value={q.id} />
                    <Button variant="ghost" type="submit" className="px-2 py-0.5 text-xs">Remove</Button>
                  </form>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
