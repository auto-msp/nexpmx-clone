import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { getOrgContext } from "@/lib/tenancy";
import { prisma } from "@/lib/db";
import { Button, Card, EmptyState, Field, Input, SectionTitle, Select, Textarea } from "@/components/ui";
import { createDecision } from "@/app/actions/decisions";

export const metadata: Metadata = { title: "Decisions", robots: { index: false } };

export default async function DecisionsPage() {
  const session = await auth();
  const ctx = await getOrgContext(session!.user!.id);

  const decisions = await prisma.decision.findMany({
    where: { orgId: ctx!.orgId },
    orderBy: { createdAt: "desc" },
    include: {
      author: { select: { name: true } },
      project: { select: { name: true } },
    },
  });

  const projects = await prisma.project.findMany({
    where: { orgId: ctx!.orgId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Decisions</h1>
        <p className="mt-1 text-sm text-muted">
          The “why” behind your work — timestamped, searchable, never lost.
        </p>
      </div>

      <Card>
        <SectionTitle>Record a decision</SectionTitle>
        <form action={createDecision} className="mt-4 space-y-4">
          <Field label="Title *">
            <Input name="title" required maxLength={160} placeholder="Chose Postgres over Mongo" />
          </Field>
          <Field label="Details *">
            <Textarea
              name="body"
              required
              maxLength={5000}
              placeholder="Context, options considered, and the reasoning…"
            />
          </Field>
          <Field label="Project">
            <Select name="projectId" defaultValue="">
              <option value="">— none —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </Field>
          <Button type="submit">Log decision</Button>
        </form>
      </Card>

      {decisions.length === 0 ? (
        <EmptyState title="No decisions recorded" hint="Log your first decision above." />
      ) : (
        <div className="grid gap-4">
          {decisions.map((d) => (
            <Card key={d.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="font-semibold">{d.title}</h2>
                <time className="text-xs text-muted" dateTime={d.createdAt.toISOString()}>
                  {d.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                </time>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted">{d.body}</p>
              <p className="mt-3 text-xs text-muted">
                — {d.author.name ?? "Unknown"}
                {d.project ? ` · ${d.project.name}` : ""}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
