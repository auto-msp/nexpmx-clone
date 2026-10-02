import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { pageContext } from "@/lib/page";
import { sp } from "@/lib/format";
import { READY_SKILLS, SKILL_CATEGORIES, categoryLabel } from "@/lib/skills";
import { PageHeader, EmptyPanel, Pill } from "@/components/kit";
import { ActionButton, ActionForm, ModalButton, SearchInput } from "@/components/kit-client";
import { Badge, cx } from "@/components/ui";
import { EmployeeChips } from "@/components/ai/fields";
import { SkillFields } from "@/components/ai/skill-fields";
import { loadTeam } from "@/components/ai/team-data";
import { createSkill, deleteSkill, teachReadySkill, updateSkill } from "@/app/actions/skills";

export const metadata: Metadata = { title: "Skills", robots: { index: false } };

function parseKeys(json: string): string[] {
  try {
    const v: unknown = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function href(tab: string, cat: string, q: string) {
  const p = new URLSearchParams();
  if (tab !== "ready") p.set("tab", tab);
  if (cat) p.set("cat", cat);
  if (q) p.set("q", q);
  const s = p.toString();
  return s ? `/ai/skills?${s}` : "/ai/skills";
}

export default async function SkillsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const tab = sp(params.tab) === "yours" ? "yours" : "ready";
  const cat = sp(params.cat);
  const q = sp(params.q).trim().toLowerCase();
  const { orgId, canWrite } = await pageContext("automation:write");

  const [rows, team, clients, projects] = await Promise.all([
    prisma.skill.findMany({ where: { orgId }, orderBy: { updatedAt: "desc" } }),
    loadTeam(orgId),
    prisma.client.findMany({ where: { orgId, status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.project.findMany({ where: { orgId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const teamChips = team.map((m) => ({ key: m.key, name: m.name, role: m.role }));
  const nameOf = new Map(team.map((m) => [m.key, m.name]));
  const taughtNames = (keys: string[]) => keys.map((k) => nameOf.get(k)).filter(Boolean).join(", ");
  const installed = new Map(rows.map((r) => [r.name, r]));

  const matches = (...texts: Array<string | null | undefined>) => !q || texts.some((t) => (t ?? "").toLowerCase().includes(q));
  const ready = READY_SKILLS.filter((s) => (!cat || s.category === cat) && matches(s.title, s.description, s.instructions));
  const mine = rows.filter((r) => matches(r.name, r.description, r.instructions));
  const clientName = new Map(clients.map((c) => [c.id, c.name]));
  const projectName = new Map(projects.map((p) => [p.id, p.name]));

  const newSkillForm = (
    <ActionForm action={createSkill} submitLabel="Create skill">
      <SkillFields team={teamChips} clients={clients} projects={projects} />
    </ActionForm>
  );

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Skills library"
        subtitle="Teach your AI teammates how you do things. Add a ready-made process or write your own, then choose who follows it."
        actions={
          canWrite ? (
            <ModalButton label="New skill" icon="plus" title="New skill" description="Write a process once and your chosen teammates will follow it." size="lg">
              {newSkillForm}
            </ModalButton>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-full border border-border bg-surface-2 p-1" role="tablist">
          {(
            [
              ["ready", `Ready-made (${READY_SKILLS.length})`],
              ["yours", `Your skills (${rows.length})`],
            ] as const
          ).map(([id, label]) => (
            <Link
              key={id}
              href={href(id, id === "ready" ? cat : "", q)}
              role="tab"
              aria-selected={tab === id}
              className={cx("rounded-full px-4 py-1.5 text-sm font-medium", tab === id ? "bg-brand text-white" : "text-muted hover:text-text")}
            >
              {label}
            </Link>
          ))}
        </div>
        <SearchInput param="q" placeholder="Search skills…" className="w-full sm:w-72" />
      </div>

      {tab === "ready" ? (
        <>
          <nav className="mb-5 flex flex-wrap gap-2" aria-label="Skill categories">
            {[{ id: "", label: "All" }, ...SKILL_CATEGORIES].map((c) => (
              <Link
                key={c.id || "all"}
                href={href("ready", c.id, q)}
                aria-current={cat === c.id ? "true" : undefined}
                className={cx(
                  "rounded-full border px-3 py-1 text-xs font-medium",
                  cat === c.id ? "border-brand bg-brand/15 text-brand" : "border-border text-muted hover:text-text",
                )}
              >
                {c.label}
              </Link>
            ))}
          </nav>

          {ready.length === 0 ? (
            <EmptyPanel icon="search" title="No skills match" hint="Try a different word or clear the category filter." />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ready.map((s) => {
                const row = installed.get(s.title);
                const assigned = row ? parseKeys(row.assignedJson) : s.taughtTo;
                return (
                  <article key={s.id} className="flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
                    <div className="h-0.5 bg-brand" aria-hidden />
                    <div className="flex flex-1 flex-col p-5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">{categoryLabel(s.category)}</span>
                        {row ? <Badge tone="success">Added</Badge> : null}
                      </div>
                      <h3 className="mt-2 font-semibold">{s.title}</h3>
                      <p className="mt-1 flex-1 text-sm text-muted">{s.description}</p>
                      <p className="mt-3 text-xs text-muted">
                        {row ? "Taught to" : "Suggested for"} {taughtNames(assigned) || "nobody yet"}
                      </p>
                      <details className="group mt-3 text-sm">
                        <summary className="cursor-pointer list-none text-xs font-medium text-brand">Preview instructions</summary>
                        <pre className="mt-2 whitespace-pre-wrap rounded-[var(--radius-control)] bg-surface-2 p-3 font-sans text-xs leading-relaxed text-muted">{s.instructions}</pre>
                      </details>
                      {canWrite ? (
                        <div className="mt-4">
                          <ModalButton
                            label={row ? "Change who learns it" : "+ Add to my AI team"}
                            variant={row ? "secondary" : "primary"}
                            className="w-full"
                            title={s.title}
                            description="Choose the teammates who should follow this."
                            size="sm"
                          >
                            <ActionForm action={teachReadySkill} submitLabel={row ? "Update" : "Teach"}>
                              <input type="hidden" name="skillId" value={s.id} />
                              <EmployeeChips employees={teamChips} defaultKeys={assigned.filter((k) => nameOf.has(k))} />
                            </ActionForm>
                          </ModalButton>
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      ) : mine.length === 0 ? (
        <EmptyPanel
          icon="file"
          title={rows.length ? "No skills match your search" : "No skills yet"}
          hint={rows.length ? "Try a different word." : "Add a ready-made skill or write your own process for the team to follow."}
          action={
            canWrite && !rows.length ? (
              <ModalButton label="New skill" icon="plus" title="New skill" size="lg">
                {newSkillForm}
              </ModalButton>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mine.map((r) => {
            const assigned = parseKeys(r.assignedJson);
            const scopeText =
              r.scope === "CLIENT" ? `Client: ${clientName.get(r.scopeId ?? "") ?? "removed"}` : r.scope === "PROJECT" ? `Project: ${projectName.get(r.scopeId ?? "") ?? "removed"}` : "Everything";
            return (
              <article key={r.id} className="flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
                <div className="h-0.5 bg-brand" aria-hidden />
                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-center justify-between gap-2">
                    <Pill tone="brand">{scopeText}</Pill>
                    <span className="font-mono text-[10px] text-muted">v{r.version}</span>
                  </div>
                  <h3 className="mt-2 font-semibold">{r.name}</h3>
                  {r.description ? <p className="mt-1 text-sm text-muted">{r.description}</p> : null}
                  <p className="mt-3 flex-1 text-xs text-muted">Taught to {taughtNames(assigned) || "nobody yet"}</p>
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer list-none text-xs font-medium text-brand">Preview instructions</summary>
                    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-[var(--radius-control)] bg-surface-2 p-3 font-sans text-xs leading-relaxed text-muted">{r.instructions}</pre>
                  </details>
                  {canWrite ? (
                    <div className="mt-4 flex items-center gap-2">
                      <ModalButton label="Edit" icon="edit" variant="secondary" className="flex-1" title={`Edit ${r.name}`} description={`Saving changes creates version ${r.version + 1}.`} size="lg">
                        <ActionForm action={updateSkill} submitLabel="Save changes">
                          <SkillFields
                            team={teamChips}
                            clients={clients}
                            projects={projects}
                            values={{
                              id: r.id,
                              name: r.name,
                              description: r.description ?? "",
                              instructions: r.instructions,
                              scope: r.scope,
                              scopeId: r.scopeId ?? "",
                              assigned,
                            }}
                          />
                        </ActionForm>
                      </ModalButton>
                      <ActionButton action={deleteSkill} fields={{ id: r.id }} label="Delete" icon="trash" variant="danger" confirm={`Delete "${r.name}"?`} />
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
