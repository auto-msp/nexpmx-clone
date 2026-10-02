import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { pageContext } from "@/lib/page";
import { relTime, sp } from "@/lib/format";
import {
  AUTOMATION_GROUPS,
  AUTOMATION_RECIPES,
  TRIGGER_OPTIONS,
  type AutomationRecipe,
} from "@/lib/automations";
import { PageHeader, EmptyPanel, Panel } from "@/components/kit";
import { ActionButton, ActionForm, ModalButton } from "@/components/kit-client";
import { Badge, cx } from "@/components/ui";
import { Icon } from "@/components/kit-icons";
import { AutomationFields } from "@/components/ai/automation-fields";
import { SwitchAction, WideActionButton } from "@/components/ai/ai-bits";
import { createAutomation, deleteAutomation, installRecipe, toggleAutomation } from "@/app/actions/automations";

export const metadata: Metadata = { title: "Automations", robots: { index: false } };

const TRIGGER_SHORT: Record<string, string> = {
  "invoice.paid": "Invoice paid",
  "proposal.signed": "Proposal signed",
  "project.created": "Project created",
  "milestone.completed": "Milestone completed",
  "task.completed": "Task completed",
};
const EFFECT_SHORT: Record<string, string> = {
  notify_founders: "Notifies founders",
  notify_client: "Notifies the client",
  create_task: "Creates a task",
};
const GROUP_META: Record<AutomationRecipe["group"], { label: string; accent: string; blurb: string }> = {
  MONEY: { label: "Money", accent: "bg-success", blurb: "React to payments and invoices." },
  DELIVERY: { label: "Delivery", accent: "bg-brand", blurb: "Keep projects and milestones moving." },
  CLIENT_CARE: { label: "Client care", accent: "bg-brand/50", blurb: "Look after clients after they sign or pay." },
  TEAM: { label: "Team", accent: "bg-warn", blurb: "Resourcing, reviews and handovers." },
};

function Chain({ trigger, effects }: { trigger: string; effects: string[] }) {
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted">
      <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 font-medium text-text">
        <Icon name="zap" className="h-3 w-3 text-brand" />
        {TRIGGER_SHORT[trigger] ?? trigger}
      </span>
      {effects.map((e) => (
        <span key={e} className="inline-flex items-center gap-1.5">
          <Icon name="chevronRight" className="h-3 w-3" />
          <span className="rounded-full bg-surface-2 px-2 py-0.5">{EFFECT_SHORT[e] ?? e}</span>
        </span>
      ))}
    </p>
  );
}

function RecipeCard({ r, added, canWrite }: { r: AutomationRecipe; added: boolean; canWrite: boolean }) {
  const g = GROUP_META[r.group];
  return (
    <article className="flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
      <div className={cx("h-0.5", g.accent)} aria-hidden />
      <div className="flex flex-1 flex-col p-5">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">{g.label}</span>
        <h3 className="mt-2 font-semibold">{r.title}</h3>
        <p className="mt-1 text-sm text-muted">{r.description}</p>
        <div className="mt-3 flex-1">
          <Chain trigger={r.trigger} effects={r.effects} />
        </div>
        {canWrite ? (
          <div className="mt-4">
            <WideActionButton action={installRecipe} fields={{ recipeId: r.id }} label="Use this" done={added} doneLabel="Added" />
          </div>
        ) : null}
      </div>
    </article>
  );
}

export default async function AutomationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const tab = sp(params.tab) === "yours" ? "yours" : "ready";
  const group = sp(params.group);
  const { orgId, canWrite } = await pageContext("automation:write");

  const [rows, clients, projects] = await Promise.all([
    prisma.automation.findMany({ where: { orgId }, orderBy: { createdAt: "desc" } }),
    prisma.client.findMany({ where: { orgId, status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.project.findMany({ where: { orgId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const addedNames = new Set(rows.map((r) => r.name));
  const clientName = new Map(clients.map((c) => [c.id, c.name]));
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const activeCount = rows.filter((r) => r.enabled).length;
  const triggerLabel = new Map<string, string>(TRIGGER_OPTIONS.map((t) => [t.value, t.label]));

  const tabHref = (t: string, g = "") => {
    const p = new URLSearchParams();
    if (t !== "ready") p.set("tab", t);
    if (g) p.set("group", g);
    const s = p.toString();
    return s ? `/ai/automations?${s}` : "/ai/automations";
  };

  const form = (
    <ActionForm action={createAutomation} submitLabel="Create automation">
      <AutomationFields clients={clients} projects={projects} />
    </ActionForm>
  );

  const groups = AUTOMATION_GROUPS.filter((g) => !group || g === group);

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Automations"
        subtitle="Set up trigger and action rules. When something happens in your workspace, the follow-up work happens on its own."
        actions={
          canWrite ? (
            <ModalButton label="Create automation" icon="plus" title="Create automation" description="Choose what to watch and what should happen." size="md">
              {form}
            </ModalButton>
          ) : null
        }
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-full border border-border bg-surface-2 p-1" role="tablist">
          {(
            [
              ["ready", `Ready to use (${AUTOMATION_RECIPES.length})`],
              ["yours", `Your automations (${rows.length})`],
            ] as const
          ).map(([id, label]) => (
            <Link
              key={id}
              href={tabHref(id)}
              role="tab"
              aria-selected={tab === id}
              className={cx("rounded-full px-4 py-1.5 text-sm font-medium", tab === id ? "bg-brand text-white" : "text-muted hover:text-text")}
            >
              {label}
            </Link>
          ))}
        </div>
        {rows.length ? (
          <p className="text-sm text-muted">
            <span className="font-medium text-text">{activeCount}</span> of {rows.length} switched on
          </p>
        ) : null}
      </div>

      {tab === "ready" ? (
        <>
          <nav className="mb-5 flex flex-wrap gap-2" aria-label="Recipe groups">
            {[{ id: "", label: "All" }, ...AUTOMATION_GROUPS.map((g) => ({ id: g, label: GROUP_META[g].label }))].map((c) => (
              <Link
                key={c.id || "all"}
                href={tabHref("ready", c.id)}
                aria-current={group === c.id ? "true" : undefined}
                className={cx(
                  "rounded-full border px-3 py-1 text-xs font-medium",
                  group === c.id ? "border-brand bg-brand/15 text-brand" : "border-border text-muted hover:text-text",
                )}
              >
                {c.label}
              </Link>
            ))}
          </nav>
          <div className="space-y-8">
            {groups.map((g) => {
              const items = AUTOMATION_RECIPES.filter((r) => r.group === g);
              return (
                <section key={g} aria-labelledby={`grp-${g}`}>
                  <div className="mb-3 flex items-baseline gap-3">
                    <h2 id={`grp-${g}`} className="text-sm font-semibold">
                      {GROUP_META[g].label}
                    </h2>
                    <span className="text-xs text-muted">{GROUP_META[g].blurb}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map((r) => (
                      <RecipeCard key={r.id} r={r} added={addedNames.has(r.title)} canWrite={canWrite} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      ) : rows.length === 0 ? (
        <EmptyPanel
          icon="zap"
          title="No automations yet"
          hint="Pick a ready-made recipe, or build your own rule from scratch."
          action={
            <Link href="/ai/automations" className="text-sm font-medium text-brand hover:underline">
              Browse ready-made recipes
            </Link>
          }
        />
      ) : (
        <Panel flush>
          <ul className="divide-y divide-border">
            {rows.map((a) => {
              const effects = [a.notifyFounders && "notify_founders", a.notifyClient && "notify_client", a.createTask && "create_task"].filter((x): x is string => Boolean(x));
              const scope =
                a.watchScope === "CLIENT"
                  ? `Client: ${clientName.get(a.watchClientId ?? "") ?? "removed"}`
                  : a.watchScope === "PROJECT"
                    ? `Project: ${projectName.get(a.watchProjectId ?? "") ?? "removed"}`
                    : "Everything";
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
                  <div className="min-w-0 flex-1 basis-64">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{a.name}</span>
                      <Badge tone={a.enabled ? "success" : "neutral"}>{a.enabled ? "On" : "Paused"}</Badge>
                    </div>
                    <div className="mt-1.5">
                      <Chain trigger={a.trigger} effects={effects} />
                    </div>
                    <p className="mt-1.5 text-xs text-muted">
                      {triggerLabel.get(a.trigger) ?? a.trigger} · Watching: {scope}
                      {a.createTask && a.taskTitle ? ` · Task: ${a.taskTitle}` : ""}
                    </p>
                  </div>
                  <div className="text-xs text-muted">
                    <span className="block font-mono text-[10px] uppercase tracking-[0.14em]">Last fired</span>
                    {a.lastFiredAt ? relTime(a.lastFiredAt) : "Never"}
                  </div>
                  {canWrite ? (
                    <div className="flex items-center gap-3">
                      <SwitchAction action={toggleAutomation} fields={{ id: a.id }} checked={a.enabled} label={`${a.enabled ? "Pause" : "Switch on"} ${a.name}`} />
                      <ActionButton action={deleteAutomation} fields={{ id: a.id }} label="Delete" icon="trash" variant="ghost" onlyIcon confirm={`Delete "${a.name}"?`} />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </div>
  );
}
