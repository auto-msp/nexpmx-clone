import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getOrgContext } from "@/lib/tenancy";
import { prisma } from "@/lib/db";
import { canRead } from "@/lib/rbac";
import { Badge, Button, Card, EmptyState, Field, Input, SectionTitle, Select, StatCard } from "@/components/ui";
import { addMemoryFact, setMemoryFactStatus } from "@/app/actions/memory";
import { MEMORY_CATEGORIES, rollupWhatWeKnow } from "@/lib/memory";
import { SubmitButton } from "@/components/submit-button";

export const metadata: Metadata = { title: "Memory", robots: { index: false } };

export default async function MemoryPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const session = await auth();
  const ctx = await getOrgContext(session!.user!.id);
  if (!canRead(ctx!.role)) throw new Error("Forbidden");

  const facts = await prisma.memoryFact.findMany({
    where: {
      orgId: ctx!.orgId,
      ...(category && MEMORY_CATEGORIES.includes(category as never) ? { category } : {}),
    },
    orderBy: [{ category: "asc" }, { factKey: "asc" }],
  });

  const [answered, open] = await Promise.all([
    prisma.memoryQuestion.count({ where: { orgId: ctx!.orgId, state: "ANSWERED" } }),
    prisma.memoryQuestion.count({ where: { orgId: ctx!.orgId, state: "OPEN" } }),
  ]);

  const summary = rollupWhatWeKnow(
    facts.filter((f) => f.status === "ACTIVE"),
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Business Memory</h1>
        <p className="mt-1 text-sm text-muted">
          The durable facts about how your business runs — the same memory your AI reads.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Facts" value={facts.filter((f) => f.status === "ACTIVE").length} />
        <StatCard label="Archived" value={facts.filter((f) => f.status === "ARCHIVED").length} />
        <StatCard label="Questions answered" value={answered} />
        <StatCard label="Open questions" value={open} />
      </div>

      <Card>
        <SectionTitle>What we know</SectionTitle>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {summary || "Nothing yet — add facts below or import a list to build the rolling summary."}
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <Link href="/memory/what-we-know" className="text-brand hover:underline">Full summary →</Link>
          <Link href="/memory/questions" className="text-brand hover:underline">Memory questions →</Link>
          <Link href="/memory/import" className="text-brand hover:underline">Import memory →</Link>
        </div>
      </Card>

      <Card>
        <SectionTitle>Add memory</SectionTitle>
        <form action={addMemoryFact} className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Category">
            <Select name="category" defaultValue="general">
              {MEMORY_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Name *">
            <Input name="factKey" required maxLength={80} placeholder="acme-payment-terms" />
          </Field>
          <Field label="Value *">
            <Input name="value" required maxLength={500} placeholder="Net-30 from invoice date" />
          </Field>
          <div className="sm:col-span-3">
            <SubmitButton pendingLabel="Saving…">Save memory</SubmitButton>
          </div>
        </form>
      </Card>

      <div className="flex flex-wrap gap-2">
        <a
          href="/memory"
          className={
            !category
              ? "rounded-full border border-brand/40 bg-brand/15 px-3 py-1 text-xs font-medium text-brand"
              : "rounded-full border border-border px-3 py-1 text-xs text-muted hover:text-text"
          }
        >
          All
        </a>
        {MEMORY_CATEGORIES.map((c) => (
          <a
            key={c}
            href={`/memory?category=${c}`}
            className={
              category === c
                ? "rounded-full border border-brand/40 bg-brand/15 px-3 py-1 text-xs font-medium text-brand"
                : "rounded-full border border-border px-3 py-1 text-xs text-muted hover:text-text"
            }
          >
            {c}
          </a>
        ))}
      </div>

      {facts.length === 0 ? (
        <EmptyState
          title="No memory facts yet"
          hint="Add one above, or use Import to paste a whole list at once."
        />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2/60 text-xs uppercase tracking-wider text-muted">
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Value</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {facts.map((f) => (
                <tr key={f.id}>
                  <td className="px-4 py-2.5"><Badge tone="neutral">{f.category}</Badge></td>
                  <td className="px-4 py-2.5 font-mono text-xs">{f.factKey}</td>
                  <td className="px-4 py-2.5">{f.value}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={f.status === "ACTIVE" ? "success" : "neutral"}>{f.status}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <form action={setMemoryFactStatus}>
                      <input type="hidden" name="id" value={f.id} />
                      <input
                        type="hidden"
                        name="status"
                        value={f.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE"}
                      />
                      <Button variant="ghost" type="submit" className="px-2 py-1 text-xs">
                        {f.status === "ACTIVE" ? "Archive" : "Restore"}
                      </Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
