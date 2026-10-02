import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getOrgContext } from "@/lib/tenancy";
import { prisma } from "@/lib/db";
import { canRead } from "@/lib/rbac";
import { Card, EmptyState, SectionTitle } from "@/components/ui";
import { MEMORY_CATEGORIES } from "@/lib/memory";

export const metadata: Metadata = { title: "What we know", robots: { index: false } };

export default async function WhatWeKnowPage() {
  const session = await auth();
  const ctx = await getOrgContext(session!.user!.id);
  if (!canRead(ctx!.role)) throw new Error("Forbidden");

  const facts = await prisma.memoryFact.findMany({
    where: { orgId: ctx!.orgId, status: "ACTIVE" },
    orderBy: [{ category: "asc" }, { factKey: "asc" }],
  });

  const byCat = MEMORY_CATEGORIES.map((c) => ({
    category: c as string,
    items: facts.filter((f) => f.category === c),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">What we know</h1>
        <p className="mt-1 text-sm text-muted">
          The rolling summary of your business memory — the brief a new teammate (or your AI) would
          read first.
        </p>
      </div>

      {facts.length === 0 ? (
        <EmptyState
          title="The memory is empty"
          hint="Add facts on the Memory page, or import a list, and the summary builds itself."
        />
      ) : (
        <div className="space-y-4">
          {byCat.map((g) => (
            <Card key={g.category}>
              <SectionTitle>{g.category.charAt(0).toUpperCase() + g.category.slice(1)}</SectionTitle>
              <ul className="mt-3 space-y-2 text-sm">
                {g.items.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-baseline gap-2">
                    <span className="font-mono text-xs text-muted">{f.factKey}</span>
                    <span className="text-text">{f.value}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      <Link href="/memory" className="inline-block text-sm text-brand hover:underline">
        ← Back to Business Memory
      </Link>
    </div>
  );
}
