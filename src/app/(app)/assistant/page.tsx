import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { pageContext } from "@/lib/page";
import { planOf } from "@/lib/plans";
import { sp } from "@/lib/format";
import { PageHeader } from "@/components/kit";
import { AssistantChat } from "@/components/ai/assistant-chat";

export const metadata: Metadata = { title: "Assistant", robots: { index: false } };

export default async function AssistantPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const q = sp(params.q).trim().slice(0, 300);
  const { orgId } = await pageContext();

  const [org, clients] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId }, select: { aiCreditsUsed: true, plan: true } }),
    prisma.client.findMany({ where: { orgId, status: "ACTIVE" }, orderBy: { updatedAt: "desc" }, take: 2, select: { name: true } }),
  ]);
  const plan = planOf(org?.plan);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow="Assistant"
        title="Ask your workspace"
        subtitle="Ask about clients, money or the week ahead. Answers are built from your own data, with the sources listed underneath."
      />
      <AssistantChat
        initialQuestion={q || undefined}
        clientNames={clients.map((c) => c.name)}
        creditsUsed={org?.aiCreditsUsed ?? 0}
        creditsLimit={plan.aiCreditsPerMonth}
      />
    </div>
  );
}
