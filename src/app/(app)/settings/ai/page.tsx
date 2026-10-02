import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { pageContext } from "@/lib/page";
import { planOf } from "@/lib/plans";
import { AI_EMPLOYEES } from "@/lib/ai-team";
import { Avatar, PageHeader, Panel, ProgressBar, FormGrid, KpiGrid, KpiTile } from "@/components/kit";
import { ActionForm, ActionButton } from "@/components/kit-client";
import { Badge, ButtonLink, Field, Select, Textarea } from "@/components/ui";
import { AI_LANGUAGES, AI_PREF_KEYS, AI_TONES, TONE_HINTS } from "@/components/settings/ai-prefs";
import { saveAiPreferences, setAiEmployeeEnabled } from "@/app/actions/settings-extended";

export const metadata: Metadata = { title: "AI settings", robots: { index: false } };

const KIND_LABELS: Record<string, string> = {
  "ai.search": "Search",
  "ai.generate": "Drafting",
  "ai.custom_skill": "Custom skills",
};

export default async function AiSettingsPage() {
  const { orgId, canWrite } = await pageContext("automation:write");

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [org, employees, usage, prefs] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId }, select: { plan: true, aiCreditsUsed: true } }),
    prisma.aiEmployee.findMany({ where: { orgId }, select: { key: true, enabled: true, custom: true, name: true, roleTitle: true } }),
    prisma.usageEvent.groupBy({ by: ["kind"], where: { orgId, createdAt: { gte: monthStart } }, _sum: { credits: true }, _count: { _all: true } }),
    prisma.memoryFact.findMany({
      where: { orgId, category: "settings", factKey: { in: Object.values(AI_PREF_KEYS) }, status: "ACTIVE" },
      select: { factKey: true, value: true },
    }),
  ]);

  const plan = planOf(org?.plan);
  const used = org?.aiCreditsUsed ?? 0;
  const limit = plan.aiCreditsPerMonth;
  const pct = Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  const tone = pct >= 90 ? "danger" : pct >= 75 ? "warn" : "brand";

  const enabledKeys = new Set(employees.filter((e) => e.enabled).map((e) => e.key));
  const customEnabled = employees.filter((e) => e.custom && e.enabled);
  const pref = (key: string) => prefs.find((p) => p.factKey === key)?.value ?? "";
  const tonePref = pref(AI_PREF_KEYS.tone) || "professional";
  const languagePref = pref(AI_PREF_KEYS.language) || "English (India)";

  return (
    <>
      <PageHeader
        title="AI"
        subtitle="Choose which AI teammates are on, how much of your monthly credits they have used, and the voice they write in."
        actions={
          <ButtonLink href="/ai/team" variant="secondary">
            Open AI team
          </ButtonLink>
        }
      />

      <KpiGrid cols={3}>
        <KpiTile label="Credits used" value={used.toLocaleString("en-IN")} hint={`of ${limit.toLocaleString("en-IN")} on ${plan.name}`} icon="zap" tone={pct >= 90 ? "danger" : pct >= 75 ? "warn" : "brand"} />
        <KpiTile label="Credits left" value={Math.max(0, limit - used).toLocaleString("en-IN")} hint="This cycle" icon="sparkle" />
        <KpiTile label="Teammates on" value={enabledKeys.size} hint={`${AI_EMPLOYEES.length} available`} icon="users" tone="success" />
      </KpiGrid>

      <div className="space-y-6">
        <Panel title="Monthly credits">
          <ProgressBar value={used} max={limit} tone={tone} />
          <p className="mt-2 text-xs text-muted">
            {pct}% of the {plan.name} allowance. Paid teammates reserve credits every month while they are on.
          </p>
          {usage.length > 0 ? (
            <ul className="mt-4 divide-y divide-border text-sm">
              {usage.map((u) => (
                <li key={u.kind} className="flex items-center justify-between py-2">
                  <span>{KIND_LABELS[u.kind] ?? u.kind}</span>
                  <span className="text-muted">
                    {u._count._all} run{u._count._all === 1 ? "" : "s"} · {(u._sum.credits ?? 0).toLocaleString("en-IN")} credits this month
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-muted">No AI activity recorded this month.</p>
          )}
        </Panel>

        <Panel title="AI teammates" flush>
          <ul className="divide-y divide-border">
            {AI_EMPLOYEES.map((e) => {
              const on = enabledKeys.has(e.key);
              return (
                <li key={e.key} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <Avatar name={e.name} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {e.name} <span className="font-normal text-muted">· {e.role}</span>
                    </p>
                    <p className="truncate text-xs text-muted">{e.owns[0]}</p>
                  </div>
                  <Badge tone={e.creditPrice === 0 ? "neutral" : "warn"}>{e.creditPrice === 0 ? "Included" : `${e.creditPrice} credits / month`}</Badge>
                  <Badge tone={on ? "success" : "neutral"}>{on ? "On" : "Off"}</Badge>
                  {canWrite ? (
                    <ActionButton
                      action={setAiEmployeeEnabled}
                      fields={{ key: e.key, enable: on ? "false" : "true" }}
                      label={on ? `Turn off ${e.name}` : `Turn on ${e.name}`}
                      variant={on ? "ghost" : "secondary"}
                    />
                  ) : null}
                </li>
              );
            })}
            {customEnabled.map((e) => (
              <li key={e.key} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span className="flex-1">
                  {e.name ?? e.key} <span className="text-muted">· {e.roleTitle ?? "Custom teammate"}</span>
                </span>
                <Badge tone="success">On</Badge>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Writing defaults">
          <p className="mb-4 text-sm text-muted">Saved to your business memory, so every AI teammate drafts in the same voice unless you ask otherwise.</p>
          {!canWrite ? <p className="mb-3 rounded-[var(--radius-control)] bg-surface-2 px-3 py-2 text-xs text-muted">Only owners and admins can change these defaults.</p> : null}
          <ActionForm action={saveAiPreferences} submitLabel="Save defaults" pendingLabel="Saving…" hideSubmit={!canWrite} resetOnSuccess={false}>
            <fieldset disabled={!canWrite} className="flex flex-col gap-4">
              <FormGrid>
                <Field label="Default tone">
                  <Select name="tone" defaultValue={tonePref}>
                    {AI_TONES.map((t) => (
                      <option key={t} value={t}>
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Default language">
                  <Select name="language" defaultValue={languagePref}>
                    {AI_LANGUAGES.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </Select>
                </Field>
              </FormGrid>
              <ul className="space-y-0.5 text-[11px] text-muted">
                {AI_TONES.map((t) => (
                  <li key={t}>
                    <strong className="text-text">{t.charAt(0).toUpperCase() + t.slice(1)}:</strong> {TONE_HINTS[t]}
                  </li>
                ))}
              </ul>
              <Field label="Standing guidance (optional)">
                <Textarea name="guidance" maxLength={600} defaultValue={pref(AI_PREF_KEYS.guidance)} placeholder="Always sign off with our studio name. Never promise delivery dates in drafts." />
              </Field>
            </fieldset>
          </ActionForm>
        </Panel>
      </div>
    </>
  );
}
