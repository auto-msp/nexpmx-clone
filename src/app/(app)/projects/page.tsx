import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { getOrgContext } from "@/lib/tenancy";
import { prisma } from "@/lib/db";
import { Badge, Button, Card, EmptyState, Field, Input, SectionTitle, Select } from "@/components/ui";
import { createProject, updateProjectStatus, createTask, setTaskStatus } from "@/app/actions/projects";
import { SubmitButton } from "@/components/submit-button";

export const metadata: Metadata = { title: "Projects", robots: { index: false } };

const TASK_COLUMNS = [
  { key: "TODO", label: "To do" },
  { key: "IN_PROGRESS", label: "In progress" },
  { key: "DONE", label: "Done" },
] as const;

export default async function ProjectsPage() {
  const session = await auth();
  const ctx = await getOrgContext(session!.user!.id);

  const projects = await prisma.project.findMany({
    where: { orgId: ctx!.orgId },
    orderBy: { createdAt: "desc" },
    include: {
      client: { select: { name: true } },
      tasks: { orderBy: { createdAt: "desc" } },
    },
  });

  const clients = await prisma.client.findMany({
    where: { orgId: ctx!.orgId, status: "ACTIVE" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <p className="mt-1 text-sm text-muted">Boards, milestones and live status.</p>
      </div>

      <Card>
        <SectionTitle>New project</SectionTitle>
        <form action={createProject} className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Project name *">
            <Input name="name" required maxLength={120} placeholder="Website revamp" />
          </Field>
          <Field label="Client">
            <Select name="clientId" defaultValue="">
              <option value="">— none —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end">
            <SubmitButton pendingLabel="Creating…">Create project</SubmitButton>
          </div>
        </form>
      </Card>

      {projects.length === 0 ? (
        <EmptyState title="No projects yet" hint="Create your first project above." />
      ) : (
        projects.map((p) => (
          <Card key={p.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">{p.name}</h2>
                <p className="text-xs text-muted">
                  {p.client ? `Client: ${p.client.name}` : "No client"} · {p.status}
                </p>
              </div>
              <form action={updateProjectStatus} className="flex items-center gap-2">
                <input type="hidden" name="id" value={p.id} />
                <Select name="status" defaultValue={p.status} className="w-36">
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="PAUSED">PAUSED</option>
                  <option value="COMPLETED">COMPLETED</option>
                </Select>
                <Button type="submit" variant="secondary">Update</Button>
              </form>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {TASK_COLUMNS.map((col) => {
                const tasks = p.tasks.filter((t) => t.status === col.key);
                return (
                  <div key={col.key} className="rounded-card border border-border bg-surface-2/40 p-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                      {col.label} ({tasks.length})
                    </h3>
                    <ul className="mt-2 space-y-2">
                      {tasks.map((t) => (
                        <li key={t.id} className="rounded-card border border-border bg-surface p-2.5 text-sm">
                          <div className="flex items-start justify-between gap-2">
                            <span>{t.title}</span>
                            <form action={setTaskStatus}>
                              <input type="hidden" name="id" value={t.id} />
                              <input type="hidden" name="status" value={col.key === "TODO" ? "IN_PROGRESS" : "DONE"} />
                              <Button variant="ghost" type="submit" className="px-2 py-0.5 text-xs">
                                {col.key === "TODO" ? "Start →" : "Done ✓"}
                              </Button>
                            </form>
                          </div>
                        </li>
                      ))}
                      {tasks.length === 0 ? (
                        <li className="text-xs text-muted">Empty</li>
                      ) : null}
                    </ul>
                  </div>
                );
              })}
            </div>

            <form action={createTask} className="mt-4 flex flex-wrap items-end gap-3">
              <input type="hidden" name="projectId" value={p.id} />
              <Field label="Add task">
                <Input name="title" required maxLength={200} placeholder="Design homepage" className="w-72" />
              </Field>
              <Button type="submit" variant="secondary">Add</Button>
            </form>

            <div className="mt-4">
              <Badge tone={p.status === "COMPLETED" ? "success" : p.status === "PAUSED" ? "warn" : "brand"}>
                {p.tasks.filter((t) => t.status === "DONE").length}/{p.tasks.length} done
              </Badge>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
