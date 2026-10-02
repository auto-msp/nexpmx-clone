import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { orgMembers, pageContext } from "@/lib/page";
import { fmtDate, inr, sp } from "@/lib/format";
import { Table, cx } from "@/components/ui";
import { Avatar, EmptyPanel, HealthBadge, PageHeader, Pill, ProgressBar, StatusBadge } from "@/components/kit";
import { ActionForm, ModalButton, ParamSelect, SearchInput, ViewToggle } from "@/components/kit-client";
import { Icon } from "@/components/kit-icons";
import { createProject } from "@/app/actions/projects";
import { ProjectFields } from "@/components/projects/project-fields";
import { PROJECT_HEALTH, PROJECT_STATUSES, projectTypeLabel } from "@/components/projects/constants";
import { DEADLINE_TEXT, deadlineInfo } from "@/components/projects/deadline";

export const metadata: Metadata = { title: "Projects", robots: { index: false } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ProjectsPage({ searchParams }: { searchParams: SearchParams }) {
  const { orgId, canWrite } = await pageContext("project:write");
  const params = await searchParams;
  const q = sp(params.q).trim();
  const statusParam = sp(params.status);
  const healthParam = sp(params.health);
  const clientParam = sp(params.client);
  const view = sp(params.view) === "table" ? "table" : "grid";

  const status = PROJECT_STATUSES.find((s) => s.value === statusParam)?.value;
  const health = PROJECT_HEALTH.find((h) => h.value === healthParam)?.value;

  const where: Prisma.ProjectWhereInput = {
    orgId,
    ...(status ? { status } : {}),
    ...(health ? { health } : {}),
    ...(clientParam ? { clientId: clientParam } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
            { client: { is: { name: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };

  const [projects, clients, totalProjects, members] = await Promise.all([
    prisma.project.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      take: 200,
      include: { client: { select: { id: true, name: true } } },
    }),
    prisma.client.findMany({ where: { orgId }, orderBy: { name: "asc" }, select: { id: true, name: true, company: true, status: true }, take: 500 }),
    prisma.project.count({ where: { orgId } }),
    orgMembers(orgId),
  ]);

  const ids = projects.map((p) => p.id);
  const [statusGroups, assigneeGroups] = ids.length
    ? await Promise.all([
        prisma.task.groupBy({ by: ["projectId", "status"], where: { orgId, projectId: { in: ids } }, _count: { _all: true } }),
        prisma.task.groupBy({ by: ["projectId", "assigneeId"], where: { orgId, projectId: { in: ids }, assigneeId: { not: null } } }),
      ])
    : [[], []];

  const progress = new Map<string, { done: number; all: number }>();
  for (const g of statusGroups) {
    if (!g.projectId) continue;
    const t = progress.get(g.projectId) ?? { done: 0, all: 0 };
    t.all += g._count._all;
    if (g.status === "DONE") t.done += g._count._all;
    progress.set(g.projectId, t);
  }
  const assignees = new Map<string, string[]>();
  for (const g of assigneeGroups) {
    if (!g.projectId || !g.assigneeId) continue;
    assignees.set(g.projectId, [...(assignees.get(g.projectId) ?? []), g.assigneeId]);
  }
  const personName = (uid: string) => members.find((m) => m.id === uid);

  const activeClients = clients.filter((c) => c.status === "ACTIVE");
  const filtered = Boolean(q || status || health || clientParam);

  const newProject = canWrite ? (
    <ModalButton label="New project" icon="plus" title="New project" description="Set up a project, then add tasks and milestones." size="lg">
      <ActionForm action={createProject} submitLabel="Create project" pendingLabel="Creating…">
        <ProjectFields clients={activeClients} />
      </ActionForm>
    </ModalButton>
  ) : null;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Projects" subtitle="Track delivery, deadlines and progress across every engagement." actions={newProject} />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <SearchInput param="q" placeholder="Search projects" className="w-full sm:w-72" />
        <ParamSelect param="status" allLabel="All statuses" options={PROJECT_STATUSES.map((s) => ({ value: s.value, label: s.label }))} />
        <ParamSelect param="client" allLabel="All clients" options={clients.map((c) => ({ value: c.id, label: c.name }))} />
        <ParamSelect param="health" allLabel="All health" options={PROJECT_HEALTH.map((h) => ({ value: h.value, label: h.label }))} />
        <div className="ml-auto">
          <ViewToggle />
        </div>
      </div>

      {projects.length === 0 ? (
        filtered || totalProjects > 0 ? (
          <EmptyPanel
            icon="search"
            title="No projects match these filters"
            hint="Adjust the search or filters to see more."
            action={<Link href="/projects" className="text-sm text-brand hover:underline">Clear filters</Link>}
          />
        ) : (
          <EmptyPanel
            icon="folder"
            title="No projects yet"
            hint="Create a project to start planning tasks, milestones and billing for a client."
            action={newProject}
          />
        )
      ) : view === "table" ? (
        <Table head={["Project", "Client", "Status", "Health", "Progress", "Deadline", "Contract value"]}>
          {projects.map((p) => {
            const t = progress.get(p.id) ?? { done: 0, all: 0 };
            const dl = deadlineInfo(p.deadline, p.status);
            return (
              <tr key={p.id} className="hover:bg-surface-2/40">
                <td className="px-4 py-3">
                  <Link href={`/projects/${p.id}`} className="font-medium hover:text-brand">{p.name}</Link>
                  <div className="text-xs text-muted">{projectTypeLabel(p.projectType)}</div>
                </td>
                <td className="px-4 py-3 text-muted">{p.client?.name ?? "Internal"}</td>
                <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                <td className="px-4 py-3"><HealthBadge health={p.health} /></td>
                <td className="px-4 py-3">
                  <div className="w-28">
                    <div className="mb-1 text-[11px] text-muted">{t.done}/{t.all} tasks</div>
                    <ProgressBar value={t.done} max={t.all || 1} tone="success" />
                  </div>
                </td>
                <td className={cx("px-4 py-3", DEADLINE_TEXT[dl.tone])}>
                  {p.deadline ? fmtDate(p.deadline) : "—"}
                  <div className="text-[11px]">{dl.text}</div>
                </td>
                <td className="px-4 py-3">{p.contractValueMinor ? inr(p.contractValueMinor) : "—"}</td>
              </tr>
            );
          })}
        </Table>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => {
            const t = progress.get(p.id) ?? { done: 0, all: 0 };
            const pct = t.all ? Math.round((t.done / t.all) * 100) : 0;
            const dl = deadlineInfo(p.deadline, p.status);
            const people = (assignees.get(p.id) ?? []).slice(0, 3);
            return (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4 transition-colors hover:border-brand"
              >
                <div>
                  <div className="truncate font-medium">{p.name}</div>
                  <div className="mt-0.5 truncate text-xs text-muted">
                    {p.client ? p.client.name : "Internal project"}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={p.status} />
                  <HealthBadge health={p.health} />
                  <Pill>{projectTypeLabel(p.projectType)}</Pill>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs text-muted">
                    <span>{t.done}/{t.all} tasks done</span>
                    <span>{pct}%</span>
                  </div>
                  <ProgressBar value={t.done} max={t.all || 1} tone="success" />
                </div>
                <div className="flex items-end justify-between gap-2 border-t border-border pt-3 text-xs">
                  <div className="space-y-1">
                    <div className={cx("flex items-center gap-1", DEADLINE_TEXT[dl.tone])}>
                      <Icon name="calendar" className="h-3.5 w-3.5" />
                      {p.deadline ? `${fmtDate(p.deadline)} · ${dl.text}` : dl.text}
                    </div>
                    <div className="flex items-center gap-1 text-muted">
                      <Icon name="rupee" className="h-3.5 w-3.5" />
                      {p.contractValueMinor ? inr(p.contractValueMinor) : "No contract value"}
                    </div>
                  </div>
                  <div className="flex -space-x-1.5">
                    {people.map((uid) => {
                      const m = personName(uid);
                      return <Avatar key={uid} name={m?.name ?? m?.email} size="sm" src={m?.image} />;
                    })}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
