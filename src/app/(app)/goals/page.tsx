import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { orgMembers, pageContext } from "@/lib/page";
import { sp } from "@/lib/format";
import { Badge, Field, Input, Select } from "@/components/ui";
import { Avatar, EmptyPanel, FormGrid, KpiGrid, KpiTile, PageHeader, PillTabs, ProgressBar } from "@/components/kit";
import { ActionButton, ActionForm, ModalButton } from "@/components/kit-client";
import { createGoal, deleteGoal, toggleGoalDone, updateGoalProgress } from "@/app/actions/goals";
import { GOAL_PERIODS, keyToDate, periodLabel, periodStartKey, todayKey, type GoalPeriod } from "@/components/home/dates";

export const metadata: Metadata = { title: "Goals", robots: { index: false } };

const PERIOD_LABEL: Record<GoalPeriod, string> = { DAILY: "Daily", WEEKLY: "Weekly", MONTHLY: "Monthly", QUARTERLY: "Quarterly" };

const fmtNum = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

export default async function GoalsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { orgId, canWrite } = await pageContext("task:write");
  const q = await searchParams;
  const requested = sp(q.period).toUpperCase();
  const period = (GOAL_PERIODS as string[]).includes(requested) ? (requested as GoalPeriod) : "WEEKLY";
  const startKey = periodStartKey(period, todayKey());
  const start = keyToDate(startKey);

  const [goals, members] = await Promise.all([
    prisma.goal.findMany({
      where: { orgId, period, OR: [{ periodStart: { gte: start } }, { done: false, periodStart: { lt: start } }] },
      orderBy: [{ done: "asc" }, { createdAt: "asc" }],
      take: 200,
    }),
    orgMembers(orgId),
  ]);
  const memberById = new Map(members.map((m) => [m.id, m]));

  const pct = (g: (typeof goals)[number]) => (g.target && g.target > 0 ? Math.min(100, Math.round((g.current / g.target) * 100)) : g.done ? 100 : 0);
  const current = goals.filter((g) => g.periodStart >= start);
  const carried = goals.filter((g) => g.periodStart < start);
  const doneCount = goals.filter((g) => g.done).length;
  const avg = goals.length ? Math.round(goals.reduce((s, g) => s + pct(g), 0) / goals.length) : 0;

  const goalForm = (
    <ActionForm action={createGoal} submitLabel="Add goal">
      <Field label="Goal">
        <Input name="title" required maxLength={160} placeholder="e.g. Book discovery calls with new leads" autoFocus />
      </Field>
      <FormGrid>
        <Field label="Metric (optional)">
          <Input name="metric" maxLength={60} placeholder="calls, proposals, ₹ collected…" />
        </Field>
        <Field label="Target (optional)">
          <Input name="target" type="number" min="0" step="any" inputMode="decimal" placeholder="e.g. 10" />
        </Field>
      </FormGrid>
      <Field label="Period">
        <Select name="period" defaultValue={period}>
          {GOAL_PERIODS.map((p) => (
            <option key={p} value={p}>
              {PERIOD_LABEL[p]}
            </option>
          ))}
        </Select>
      </Field>
      <p className="text-xs text-muted">Leave the target empty for a simple done / not done goal.</p>
    </ActionForm>
  );

  const card = (g: (typeof goals)[number]) => {
    const owner = memberById.get(g.ownerId);
    const p = pct(g);
    const step = g.target && g.target >= 100 ? 10 : g.target && g.target >= 20 ? 5 : 1;
    return (
      <li key={g.id} className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={`text-sm font-semibold ${g.done ? "text-muted line-through" : ""}`}>{g.title}</p>
            <p className="mt-0.5 text-xs text-muted">
              {g.target ? (
                <>
                  <span className="font-medium text-text">{fmtNum(g.current)}</span> of {fmtNum(g.target)}
                  {g.metric ? ` ${g.metric}` : ""}
                </>
              ) : g.metric ? (
                g.metric
              ) : (
                "Done / not done"
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {g.done ? <Badge tone="success">Done</Badge> : <Badge tone={p >= 60 ? "brand" : "neutral"}>{p}%</Badge>}
            {owner ? <Avatar name={owner.name ?? owner.email} size="sm" src={owner.image} /> : null}
          </div>
        </div>
        <ProgressBar value={p} tone={g.done || p >= 100 ? "success" : p >= 60 ? "brand" : "warn"} />
        {canWrite ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {g.target ? (
              <>
                <ActionButton action={updateGoalProgress} fields={{ id: g.id, mode: "delta", value: String(-step) }} label={`−${step}`} variant="secondary" title={`Decrease by ${step}`} />
                <ActionButton action={updateGoalProgress} fields={{ id: g.id, mode: "delta", value: String(step) }} label={`+${step}`} variant="secondary" title={`Increase by ${step}`} />
                <ModalButton
                  label="Set value"
                  title="Set progress"
                  description={g.title}
                  variant="ghost"
                  size="sm"
                  className="px-2.5 py-1.5 text-xs"
                >
                  <ActionForm action={updateGoalProgress} submitLabel="Save progress" resetOnSuccess={false}>
                    <input type="hidden" name="id" value={g.id} />
                    <input type="hidden" name="mode" value="set" />
                    <Field label={`Current value${g.metric ? ` (${g.metric})` : ""}`}>
                      <Input name="value" type="number" min="0" step="any" inputMode="decimal" defaultValue={g.current} required />
                    </Field>
                  </ActionForm>
                </ModalButton>
              </>
            ) : null}
            <ActionButton
              action={toggleGoalDone}
              fields={{ id: g.id }}
              label={g.done ? "Reopen" : "Mark done"}
              icon="check"
              variant={g.done ? "ghost" : "secondary"}
            />
            <span className="ml-auto">
              <ActionButton action={deleteGoal} fields={{ id: g.id }} label="Delete goal" icon="trash" onlyIcon confirm={`Delete the goal "${g.title}"?`} />
            </span>
          </div>
        ) : null}
      </li>
    );
  };

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Goals"
        subtitle={`${PERIOD_LABEL[period]} goals · ${periodLabel(period, startKey)}`}
        actions={
          canWrite ? (
            <ModalButton label="New goal" icon="plus" title="New goal" description="Set a target for the period and track it as you go.">
              {goalForm}
            </ModalButton>
          ) : null
        }
      />

      <div className="mb-5">
        <PillTabs items={GOAL_PERIODS.map((p) => ({ href: `/goals?period=${p.toLowerCase()}`, label: PERIOD_LABEL[p], active: p === period }))} />
      </div>

      <KpiGrid cols={3}>
        <KpiTile label="Goals" value={goals.length} hint={carried.length ? `${carried.length} carried over` : "this period"} icon="target" />
        <KpiTile label="Completed" value={doneCount} hint={goals.length ? `${goals.length - doneCount} still open` : "nothing yet"} tone="success" icon="check" />
        <KpiTile label="Average progress" value={`${avg}%`} icon="chart" tone={avg >= 60 ? "success" : avg >= 30 ? "brand" : "warn"} />
      </KpiGrid>

      {goals.length === 0 ? (
        <EmptyPanel
          icon="target"
          title={`No ${PERIOD_LABEL[period].toLowerCase()} goals yet`}
          hint="Pick one or two outcomes that matter this period, give them a number, and update them as you go."
          action={
            canWrite ? (
              <ModalButton label="New goal" icon="plus" title="New goal">
                {goalForm}
              </ModalButton>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-6">
          {current.length ? <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">{current.map(card)}</ul> : null}
          {carried.length ? (
            <section>
              <h2 className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Carried over from earlier periods</h2>
              <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">{carried.map(card)}</ul>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
