import type { Metadata } from "next";
import Link from "next/link";
import { pageContext } from "@/lib/page";
import { inr, sp } from "@/lib/format";
import { Table } from "@/components/ui";
import { Avatar, EmptyPanel, KpiGrid, KpiTile, PageHeader, PillTabs, Panel, ProgressBar, StatusBadge } from "@/components/kit";
import { Icon } from "@/components/kit-icons";
import { GroupedBars } from "@/components/home/charts";
import { ASSUMED_HOURS_PER_TASK, REPORT_PERIODS, loadReport, parsePeriod, rangeLabel } from "@/components/home/report-queries";

export const metadata: Metadata = { title: "Reports", robots: { index: false } };

function CsvLink({ table, period, label = "Download CSV" }: { table: string; period: string; label?: string }) {
  return (
    <a
      href={`/reports/export?table=${table}&period=${period}`}
      download
      className="inline-flex items-center gap-1.5 rounded-[var(--radius-control)] px-2.5 py-1.5 text-xs text-muted hover:bg-surface-2 hover:text-text"
    >
      <Icon name="download" className="h-3.5 w-3.5" />
      {label}
    </a>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { orgId } = await pageContext();
  const q = await searchParams;
  const period = parsePeriod(sp(q.period));
  const r = await loadReport(orgId, period);
  const k = r.kpis;
  const statusTotal = Math.max(1, ...r.statuses.map((s) => s.amount));
  const maxCollected = Math.max(1, ...r.clients.map((c) => c.collected));

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Reports" subtitle={`${r.periodLabel} · ${rangeLabel(r)}. Everything is calculated from your invoices, expenses, tasks and projects.`} />

      <div className="mb-5">
        <PillTabs items={REPORT_PERIODS.map((p) => ({ href: `/reports?period=${p.id}`, label: p.label, active: p.id === period }))} />
      </div>

      <KpiGrid cols={4}>
        <KpiTile label="Revenue collected" value={inr(k.collected)} hint="Paid invoices incl. GST" icon="wallet" tone="success" />
        <KpiTile label="Invoiced" value={inr(k.invoiced)} hint="Sent in this period" icon="receipt" />
        <KpiTile label="Outstanding" value={inr(k.outstanding)} hint={k.overdue > 0 ? `${inr(k.overdue)} overdue` : "Nothing overdue"} icon="clock" tone={k.overdue > 0 ? "warn" : "neutral"} />
        <KpiTile label="Expenses" value={inr(k.expenses)} hint="Logged in this period" icon="rupee" />
        <KpiTile label="Net" value={inr(k.net)} hint="Collected minus expenses" icon="chart" tone={k.net < 0 ? "danger" : "brand"} />
        <KpiTile label="New clients" value={k.newClients} icon="users" />
        <KpiTile label="Projects completed" value={k.projectsCompleted} icon="folder" />
        <KpiTile label="Tasks completed" value={k.tasksCompleted} icon="tasks" />
      </KpiGrid>

      <div className="space-y-5">
        <Panel title="Revenue vs expenses" action={<CsvLink table="expenses" period={period} label="Expenses CSV" />}>
          <GroupedBars
            labels={r.buckets.map((b) => b.label)}
            series={[
              { name: "Collected", values: r.buckets.map((b) => b.revenue), className: "bg-success" },
              { name: "Expenses", values: r.buckets.map((b) => b.expenses), className: "bg-warn" },
            ]}
            ariaLabel={`Collected versus expenses, ${r.periodLabel.toLowerCase()}`}
          />
        </Panel>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Panel title="Invoice status" action={<CsvLink table="invoices" period={period} label="Invoices CSV" />}>
            <ul className="space-y-3">
              {r.statuses.map((s) => (
                <li key={s.status}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2">
                      <StatusBadge status={s.status} />
                      <span className="text-xs text-muted">
                        {s.count} invoice{s.count === 1 ? "" : "s"}
                      </span>
                    </span>
                    <span className="font-medium">{inr(s.amount)}</span>
                  </div>
                  <ProgressBar value={s.amount} max={statusTotal} tone={s.status === "PAID" ? "success" : s.status === "OVERDUE" ? "danger" : s.status === "SENT" ? "warn" : "brand"} />
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">Invoices dated within the period, drafts included.</p>
          </Panel>

          <Panel title="Top clients by revenue" action={<CsvLink table="clients" period={period} label="Clients CSV" />}>
            {r.clients.length === 0 ? (
              <EmptyPanel icon="users" title="No payments received" hint="Clients appear here once an invoice is paid in this period." />
            ) : (
              <ol className="space-y-3">
                {r.clients.slice(0, 6).map((c, i) => (
                  <li key={c.id}>
                    <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                      <Link href={`/clients/${c.id}`} className="min-w-0 truncate hover:text-brand">
                        <span className="mr-2 font-mono text-xs text-muted">{i + 1}</span>
                        {c.name}
                      </Link>
                      <span className="shrink-0 font-medium">{inr(c.collected)}</span>
                    </div>
                    <ProgressBar value={c.collected} max={maxCollected} tone="success" />
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>

        <Panel title="Top projects" flush>
          {r.projects.length === 0 ? (
            <div className="p-5">
              <EmptyPanel icon="folder" title="No project activity" hint="Completed tasks and project-linked payments in this period show up here." />
            </div>
          ) : (
            <Table head={["#", "Project", "Tasks completed", "Collected"]}>
              {r.projects.slice(0, 6).map((p, i) => (
                <tr key={p.id}>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted">{i + 1}</td>
                  <td className="px-4 py-2.5 font-medium">
                    <Link href={`/projects/${p.id}`} className="hover:text-brand">
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-muted">{p.tasksDone}</td>
                  <td className="px-4 py-2.5">{inr(p.collected)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>

        <Panel title="Team performance" action={<CsvLink table="team" period={period} label="Team CSV" />} flush>
          {r.team.length === 0 ? (
            <div className="p-5">
              <EmptyPanel icon="users" title="No team members yet" hint="Invite people from Settings to track their workload here." />
            </div>
          ) : (
            <>
              <Table head={["Member", "Open tasks", "Completed", "Overdue", "Planned / capacity", "Utilisation"]}>
                {r.team.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2">
                        <Avatar name={m.name} size="sm" />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{m.name}</span>
                          {m.designation ? <span className="block truncate text-xs text-muted">{m.designation}</span> : null}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5">{m.openTasks}</td>
                    <td className="px-4 py-2.5">{m.completed}</td>
                    <td className={`px-4 py-2.5 ${m.overdue > 0 ? "font-medium text-danger" : "text-muted"}`}>{m.overdue}</td>
                    <td className="px-4 py-2.5 text-muted">
                      {m.plannedHours}h / {m.capacityHours ? `${m.capacityHours}h` : "—"}
                    </td>
                    <td className="min-w-36 px-4 py-2.5">
                      {m.utilisation === null ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <ProgressBar value={m.utilisation} tone={m.utilisation > 100 ? "danger" : m.utilisation >= 80 ? "warn" : "brand"} />
                          </div>
                          <span className="w-10 text-right text-xs">{m.utilisation}%</span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </Table>
              <p className="px-5 py-3 text-xs text-muted">
                Completed counts tasks finished in the selected period. Utilisation compares this week&apos;s load — open tasks due within seven days or already overdue, at an assumed {ASSUMED_HOURS_PER_TASK}h each,
                since tasks carry no time estimate — with each person&apos;s weekly capacity.
              </p>
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}
