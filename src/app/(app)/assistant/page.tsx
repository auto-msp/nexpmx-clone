import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { getOrgContext } from "@/lib/tenancy";
import { prisma } from "@/lib/db";
import { planOf } from "@/lib/plans";
import { buildContextAndAnswer } from "@/app/actions/assistant";
import { Card, Field, Input, SectionTitle, Button, Badge } from "@/components/ui";

export const metadata: Metadata = { title: "AI Assistant", robots: { index: false } };

export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const session = await auth();
  const ctx = await getOrgContext(session!.user!.id);

  const org = await prisma.organization.findUnique({
    where: { id: ctx!.orgId },
    select: { aiCreditsUsed: true, plan: true },
  });
  const plan = planOf(org?.plan);

  // Only run a query when the user actually asked something.
  const result = q && q.trim() ? await buildContextAndAnswer(q.trim()) : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AI Assistant</h1>
        <p className="mt-1 text-sm text-muted">
          Ask anything about your clients, projects, invoices and decisions.
          Answers are grounded in your own business memory.
        </p>
      </div>

      <Card>
        <SectionTitle>Ask your memory</SectionTitle>
        <form method="GET" className="mt-4 flex flex-wrap items-end gap-3">
          <Field label="Question">
            <Input
              name="q"
              defaultValue={q ?? ""}
              maxLength={300}
              placeholder="e.g. What did we decide on the Acme homepage?"
              className="w-96 max-w-full"
            />
          </Field>
          <Button type="submit">Ask</Button>
        </form>
        <p className="mt-3 text-xs text-muted">
          Credits used this cycle: {org?.aiCreditsUsed ?? 0} / {plan.aiCreditsPerMonth}
        </p>
      </Card>

      {result ? (
        <Card>
          <div className="flex items-center justify-between gap-3">
            <SectionTitle>Answer</SectionTitle>
            <Badge tone="brand">+{result.creditsUsed} credits</Badge>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{result.answer}</p>
          {result.sources.length > 0 ? (
            <div className="mt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Sources</h3>
              <ul className="mt-2 space-y-1.5 text-sm text-muted">
                {result.sources.map((s, i) => (
                  <li key={i}>
                    <span className="font-medium text-text">[{s.kind}]</span> {s.title}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
