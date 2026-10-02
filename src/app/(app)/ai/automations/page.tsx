import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { getOrgContext } from "@/lib/tenancy";
import { prisma } from "@/lib/db";
import { canRead } from "@/lib/rbac";
import { Badge, Button, Card, EmptyState, Field, Input, SectionTitle, Select } from "@/components/ui";
import {
  installRecipe,
  createAutomation,
  toggleAutomation,
  deleteAutomation,
} from "@/app/actions/automations";
import {
  AUTOMATION_RECIPES,
  AUTOMATION_GROUPS,
  TRIGGER_OPTIONS,
  type AutomationEffect,
} from "@/lib/automations";

export const metadata: Metadata = { title: "Automations", robots: { index: false } };

const GROUP_LABELS: Record<string, string> = {
  MONEY: "Money",
  DELIVERY: "Delivery",
  CLIENT_CARE: "Client care",
  TEAM: "Team",
};

const TRIGGER_LABELS = Object.fromEntries(TRIGGER_OPTIONS.map((t) => [t.value, t.label]));

function effectLine(effects: AutomationEffect[]): string {
  const parts: string[] = [];
  if (effects.includes("notify_founders")) parts.push("Notifies founders");
  if (effects.includes("notify_client")) parts.push("Notifies the client");
  if (effects.includes("create_task")) parts.push("Creates a task");
  return parts.join(" → ");
}

export default async function AutomationsPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string; show?: string }>;
}) {
  const { group, show } = await searchParams;
  const session = await auth();
  const ctx = await getOrgContext(session!.user!.id);
  if (!canRead(ctx!.role)) throw new Error("Forbidden");

  const [installed, clients, projects] = await Promise.all([
    prisma.automation.findMany({
      where: { orgId: ctx!.orgId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.client.findMany({
      where: { orgId: ctx!.orgId, status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.project.findMany({
      where: { orgId: ctx!.orgId },
      select: { id: true, name: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  const visibleRecipes = AUTOMATION_RECIPES.filter(
    (r) => !group || AUTOMATION_GROUPS.includes(group as never) && r.group === group,
  );
  const installedIds = new Set(
    installed.map((a) => {
      try {
        return (JSON.parse(a.configJson) as { recipeId?: string }).recipeId ?? "";
      } catch {
        return "";
      }
    }),
  );
  const showBuilder = show === "builder";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Automations</h1>
          <p className="mt-1 text-sm text-muted">
            Trigger → action workflows. When something happens, the busywork happens too.
          </p>
        </div>
        <a
          href={showBuilder ? "/ai/automations" : "/ai/automations?show=builder#builder"}
          className="rounded-[var(--radius-control)] bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-strong"
        >
          + New automation
        </a>
      </div>

      {showBuilder ? (
        <div id="builder">
        <Card>
          <SectionTitle>New automation</SectionTitle>
          <form action={createAutomation} className="mt-4 space-y-4">
            <Field label="Name *">
              <Input name="name" required maxLength={120} placeholder="Chase payment on overdue invoice" />
            </Field>
            <Field label="When… (trigger) *">
              <Select name="trigger" defaultValue="invoice.paid">
                {TRIGGER_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </Select>
            </Field>
            <fieldset>
              <legend className="text-xs font-medium text-muted">Then… (actions)</legend>
              <div className="mt-2 space-y-2 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="notifyFounders" className="h-4 w-4 rounded border-border" />
                  Notify founders
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="notifyClient" className="h-4 w-4 rounded border-border" />
                  Notify the client
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="createTask" className="h-4 w-4 rounded border-border" />
                  Create a follow-up task
                </label>
              </div>
            </fieldset>
            <Field label="Message / task title (optional)">
              <Input name="taskTitle" maxLength={200} placeholder="e.g. Follow up on this project" />
            </Field>
            <Field label="Watch">
              <Select name="watchScope" defaultValue="ALL">
                <option value="ALL">Everything</option>
                <option value="CLIENT">One client</option>
                <option value="PROJECT">One project</option>
              </Select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Client (when watching one client)">
                <Select name="watchClientId" defaultValue="">
                  <option value="">—</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Project (when watching one project)">
                <Select name="watchProjectId" defaultValue="">
                  <option value="">—</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit">Create</Button>
              <a href="/ai/automations" className="text-sm text-muted hover:text-text">Cancel</a>
            </div>
          </form>
        </Card>
        </div>
      ) : null}

      <section aria-label="Your automations">
        <h2 className="text-lg font-semibold tracking-tight">Your automations ({installed.length})</h2>
        {installed.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              title="Nothing installed yet"
              hint="Add a ready-to-use recipe below, or build your own."
            />
          </div>
        ) : (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {installed.map((a) => (
              <Card key={a.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{a.name}</div>
                    <div className="mt-1 text-xs text-muted">
                      {TRIGGER_LABELS[a.trigger] ?? a.trigger} → {effectLine(
                        [
                          ...(a.notifyFounders ? (["notify_founders"] as AutomationEffect[]) : []),
                          ...(a.notifyClient ? (["notify_client"] as AutomationEffect[]) : []),
                          ...(a.createTask ? (["create_task"] as AutomationEffect[]) : []),
                        ],
                      )}
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      Watch: {a.watchScope === "ALL" ? "everything" : a.watchScope === "CLIENT" ? "one client" : "one project"}
                      {a.lastFiredAt ? ` · last fired ${a.lastFiredAt.toISOString().slice(0, 10)}` : " · never fired"}
                    </div>
                  </div>
                  <Badge tone={a.enabled ? "success" : "neutral"}>{a.enabled ? "on" : "off"}</Badge>
                </div>
                <div className="mt-3 flex gap-2">
                  <form action={toggleAutomation}>
                    <input type="hidden" name="id" value={a.id} />
                    <Button variant="secondary" type="submit" className="px-3 py-1.5 text-xs">
                      {a.enabled ? "Disable" : "Enable"}
                    </Button>
                  </form>
                  <form action={deleteAutomation}>
                    <input type="hidden" name="id" value={a.id} />
                    <Button variant="ghost" type="submit" className="px-3 py-1.5 text-xs">Remove</Button>
                  </form>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        <a
          href="/ai/automations"
          className={
            !group
              ? "rounded-full border border-brand/40 bg-brand/15 px-3 py-1 text-xs font-medium text-brand"
              : "rounded-full border border-border px-3 py-1 text-xs text-muted hover:text-text"
          }
        >
          All
        </a>
        {AUTOMATION_GROUPS.map((g) => (
          <a
            key={g}
            href={`/ai/automations?group=${g}`}
            className={
              group === g
                ? "rounded-full border border-brand/40 bg-brand/15 px-3 py-1 text-xs font-medium text-brand"
                : "rounded-full border border-border px-3 py-1 text-xs text-muted hover:text-text"
            }
          >
            {GROUP_LABELS[g]}
          </a>
        ))}
      </div>

      <section aria-label="Ready to use">
        <h2 className="text-lg font-semibold tracking-tight">Ready to use</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleRecipes.map((r) => {
            const installedAlready = installedIds.has(r.id);
            return (
              <Card key={r.id}>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                  {GROUP_LABELS[r.group]}
                </div>
                <h3 className="mt-1 font-semibold">{r.title}</h3>
                <p className="mt-1 text-sm text-muted">{r.description}</p>
                <p className="mt-2 text-xs text-brand">
                  ⚡ {TRIGGER_LABELS[r.trigger]} → {effectLine(r.effects)}
                </p>
                <form action={installRecipe} className="mt-3">
                  <input type="hidden" name="recipeId" value={r.id} />
                  <Button
                    variant={installedAlready ? "secondary" : "primary"}
                    type="submit"
                    className="w-full px-3 py-1.5 text-xs"
                  >
                    {installedAlready ? "✓ Installed — add again" : "+ Add"}
                  </Button>
                </form>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
