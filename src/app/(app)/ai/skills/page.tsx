import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { getOrgContext } from "@/lib/tenancy";
import { prisma } from "@/lib/db";
import { canRead } from "@/lib/rbac";
import { Badge, Button, Card, Field, Input, SectionTitle, Select, Textarea } from "@/components/ui";
import { addReadySkillToTeam, createCustomSkill } from "@/app/actions/ai";
import { READY_SKILLS, SKILL_CATEGORIES, categoryLabel, taughtToLine } from "@/lib/skills";
import { SubmitButton } from "@/components/submit-button";

export const metadata: Metadata = { title: "AI skills", robots: { index: false } };

export default async function AiSkillsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; tab?: string }>;
}) {
  const { category, tab } = await searchParams;
  const session = await auth();
  const ctx = await getOrgContext(session!.user!.id);
  if (!canRead(ctx!.role)) throw new Error("Forbidden");

  // Installed skills are stored as memory facts with the skill- prefix.
  const installed = await prisma.memoryFact.findMany({
    where: { orgId: ctx!.orgId, factKey: { startsWith: "skill-" } },
    select: { factKey: true },
  });
  const installedIds = new Set(installed.map((f) => f.factKey.replace(/^skill-/, "")));

  const visibleSkills = READY_SKILLS.filter(
    (s) => !category || s.category === category,
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AI Skills Library</h1>
        <p className="mt-1 text-sm text-muted">
          Teach your AI employees your processes. Add a skill to the team and they follow it — with
          the instructions stored in your memory.
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Skill categories">
        <a
          href="/ai/skills"
          className={
            !category
              ? "rounded-full border border-brand/40 bg-brand/15 px-3 py-1 text-xs font-medium text-brand"
              : "rounded-full border border-border px-3 py-1 text-xs text-muted hover:text-text"
          }
        >
          All
        </a>
        {SKILL_CATEGORIES.map((c) => (
          <a
            key={c.id}
            href={`/ai/skills?category=${c.id}`}
            className={
              category === c.id
                ? "rounded-full border border-brand/40 bg-brand/15 px-3 py-1 text-xs font-medium text-brand"
                : "rounded-full border border-border px-3 py-1 text-xs text-muted hover:text-text"
            }
          >
            {c.label}
          </a>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleSkills.map((s) => {
          const added = installedIds.has(s.id);
          return (
            <Card key={s.id}>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                {categoryLabel(s.category)}
              </div>
              <h2 className="mt-1 font-semibold">{s.title}</h2>
              <p className="mt-1 text-sm text-muted">{s.description}</p>
              <p className="mt-2 text-xs text-muted">{taughtToLine(s.taughtTo)}</p>
              <details className="mt-3 rounded-[var(--radius-control)] border border-border bg-surface-2/40 px-3 py-2">
                <summary className="cursor-pointer text-xs text-muted">Preview instructions</summary>
                <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted">
                  {s.instructions}
                </pre>
              </details>
              <form action={addReadySkillToTeam} className="mt-3">
                <input type="hidden" name="skillId" value={s.id} />
                <Button variant={added ? "secondary" : "primary"} type="submit" className="w-full px-3 py-1.5 text-xs">
                  {added ? "✓ In the team library — re-save" : "+ Add to my AI team"}
                </Button>
              </form>
            </Card>
          );
        })}
      </div>

      <Card>
        <SectionTitle>Your skills</SectionTitle>
        <p className="mt-2 text-sm text-muted">
          Write a custom skill in the house format: numbered steps, one action per step, decision
          points called out. It is stored as business memory and audited like any other fact.
        </p>
        <form action={createCustomSkill} className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Title *">
            <Input name="title" required maxLength={120} placeholder="Deployment SOP" />
          </Field>
          <Field label="Assign to (employee names)">
            <Input name="taughtTo" maxLength={200} placeholder="aria, maya" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Instructions *">
              <Textarea
                name="instructions"
                required
                maxLength={5000}
                className="min-h-32"
                placeholder="1. Do the first thing.\n2. Then this.\n3. If X, escalate to the founder."
              />
            </Field>
          </div>
          <input type="hidden" name="category" value="OPERATIONS" />
          <input type="hidden" name="tab" value={tab ?? "ready"} />
          <div className="sm:col-span-2">
            <SubmitButton pendingLabel="Saving…">Save custom skill</SubmitButton>
          </div>
        </form>
        <p className="mt-3 flex items-center gap-2 text-xs text-muted">
          <Badge tone="neutral">{installedIds.size}</Badge> ready-made skills installed so far.
        </p>
      </Card>
    </div>
  );
}
