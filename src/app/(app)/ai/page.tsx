import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getOrgContext } from "@/lib/tenancy";
import { prisma } from "@/lib/db";
import { canRead } from "@/lib/rbac";
import { planOf } from "@/lib/plans";
import { Badge, Card, SectionTitle, StatCard } from "@/components/ui";
import { AI_EMPLOYEES } from "@/lib/ai-team";
import { AUTOMATION_RECIPES } from "@/lib/automations";
import { READY_SKILLS } from "@/lib/skills";

export const metadata: Metadata = { title: "AI", robots: { index: false } };

export default async function AiHubPage() {
  const session = await auth();
  const ctx = await getOrgContext(session!.user!.id);
  if (!canRead(ctx!.role)) throw new Error("Forbidden");

  const [org, enabled, automations] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: ctx!.orgId },
      select: { aiCreditsUsed: true, plan: true },
    }),
    prisma.aiEmployee.findMany({ where: { orgId: ctx!.orgId, enabled: true } }),
    prisma.automation.findMany({ where: { orgId: ctx!.orgId, enabled: true } }),
  ]);
  const plan = planOf(org?.plan);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AI</h1>
        <p className="mt-1 text-sm text-muted">
          Your AI employees, skills and automations — working from the same business memory.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="AI team on duty"
          value={`${enabled.length}/${AI_EMPLOYEES.length}`}
          hint={enabled.map((e) => e.key).join(", ") || "Nobody yet"}
        />
        <StatCard label="Active automations" value={automations.length} hint={`${AUTOMATION_RECIPES.length} recipes available`} />
        <StatCard label="Skills in library" value={READY_SKILLS.length} />
        <StatCard label="AI credits" value={`${org?.aiCreditsUsed ?? 0}/${plan.aiCreditsPerMonth}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <SectionTitle>Assistant</SectionTitle>
          <p className="mt-2 text-sm text-muted">
            Ask anything about clients, projects, invoices and decisions. Grounded in your own memory.
          </p>
          <Link href="/assistant" className="mt-4 inline-block rounded-[var(--radius-control)] bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-strong">
            Open assistant
          </Link>
        </Card>
        <Card>
          <SectionTitle>AI team</SectionTitle>
          <p className="mt-2 text-sm text-muted">
            Role-carded virtual employees — Aria, Vikram, Maya, Leo and Sage — each with an owned remit.
          </p>
          <ul className="mt-3 space-y-1 text-sm">
            {AI_EMPLOYEES.map((e) => {
              const on = enabled.some((row) => row.key === e.key);
              return (
                <li key={e.key} className="flex items-center justify-between gap-2">
                  <span>
                    <span aria-hidden className={`mr-1.5 inline-block h-2 w-2 rounded-full align-middle ${e.avatarHue}`} />
                    {e.name} <span className="text-muted">· {e.role}</span>
                  </span>
                  <Badge tone={on ? "success" : "neutral"}>{on ? "on duty" : "off"}</Badge>
                </li>
              );
            })}
          </ul>
          <Link href="/ai/team" className="mt-4 inline-block text-sm text-brand hover:underline">
            Manage the team →
          </Link>
        </Card>
        <Card>
          <SectionTitle>Automations</SectionTitle>
          <p className="mt-2 text-sm text-muted">
            Trigger → action workflows. When something happens, the busywork happens too.
          </p>
          <ul className="mt-3 space-y-1 text-sm text-muted">
            {automations.slice(0, 4).map((a) => (
              <li key={a.id} className="truncate">• {a.name}</li>
            ))}
            {automations.length === 0 ? <li>None enabled yet.</li> : null}
          </ul>
          <Link href="/ai/automations" className="mt-4 inline-block text-sm text-brand hover:underline">
            Browse recipes →
          </Link>
        </Card>
      </div>

      <Card>
        <SectionTitle>Skills library</SectionTitle>
        <p className="mt-2 text-sm text-muted">
          Teach your AI employees your processes — ready-made SOPs across client management,
          delivery, finance, operations, writing and sales.
        </p>
        <Link href="/ai/skills" className="mt-4 inline-block rounded-[var(--radius-control)] border border-border bg-surface-2 px-4 py-2 text-sm font-medium hover:border-brand">
          Browse {READY_SKILLS.length} skills
        </Link>
      </Card>
    </div>
  );
}
