import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { pageContext } from "@/lib/page";
import { fmtDate, relTime, sp } from "@/lib/format";
import { PageHeader, EmptyPanel, Avatar, Pill } from "@/components/kit";
import { ActionButton, ActionForm, ModalButton, ParamSelect, SearchInput } from "@/components/kit-client";
import { FieldLabel, Input, Select, Textarea } from "@/components/ai/fields";
import { addDecisionComment, createDecision, deleteDecision } from "@/app/actions/decisions";

export const metadata: Metadata = { title: "Decisions", robots: { index: false } };

export default async function DecisionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const q = sp(params.q).trim();
  const projectId = sp(params.project);
  const clientId = sp(params.client);
  const { orgId, userId, role, canWrite } = await pageContext("decision:write");

  const [decisions, projects, clients, total] = await Promise.all([
    prisma.decision.findMany({
      where: {
        orgId,
        ...(projectId ? { projectId } : {}),
        ...(clientId ? { clientId } : {}),
        ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" as const } }, { body: { contains: q, mode: "insensitive" as const } }] } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 60,
      include: {
        author: { select: { name: true, email: true } },
        project: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
        comments: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true, email: true } } } },
      },
    }),
    prisma.project.findMany({ where: { orgId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.client.findMany({ where: { orgId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.decision.count({ where: { orgId } }),
  ]);
  const isAdmin = role === "OWNER" || role === "ADMIN";
  const filtered = Boolean(q || projectId || clientId);

  const newForm = (
    <ActionForm action={createDecision} submitLabel="Log decision">
      <label className="block">
        <FieldLabel>What was decided</FieldLabel>
        <Input name="title" required maxLength={160} placeholder="Move all retainers to quarterly billing" />
      </label>
      <label className="block">
        <FieldLabel hint="Context and reasons">Details</FieldLabel>
        <Textarea name="body" required maxLength={5000} placeholder="Why this was decided, what was considered and what happens next." className="min-h-32" />
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <FieldLabel hint="Optional">Project</FieldLabel>
          <Select name="projectId" defaultValue="">
            <option value="">Not linked</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </label>
        <label className="block">
          <FieldLabel hint="Optional">Client</FieldLabel>
          <Select name="clientId" defaultValue="">
            <option value="">Not linked</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </label>
      </div>
    </ActionForm>
  );

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Decisions"
        subtitle="A running log of what was decided and why, so nobody has to ask twice."
        actions={
          canWrite ? (
            <ModalButton label="New decision" icon="plus" title="Log a decision" description="Record it while the reasoning is still fresh." size="md">
              {newForm}
            </ModalButton>
          ) : null
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <SearchInput param="q" placeholder="Search decisions…" className="w-full sm:w-72" />
        <ParamSelect param="project" allLabel="All projects" options={projects.map((p) => ({ value: p.id, label: p.name }))} />
        <ParamSelect param="client" allLabel="All clients" options={clients.map((c) => ({ value: c.id, label: c.name }))} />
        {filtered ? (
          <Link href="/decisions" className="text-xs text-brand hover:underline">Clear filters</Link>
        ) : (
          <span className="text-xs text-muted">{total} logged</span>
        )}
      </div>

      {decisions.length === 0 ? (
        <EmptyPanel
          icon="file"
          title={filtered ? "No decisions match" : "No decisions logged yet"}
          hint={filtered ? "Try a different search or clear the filters." : "Capture pricing rules, scope calls and policy changes here."}
          action={!filtered && canWrite ? <ModalButton label="New decision" icon="plus" title="Log a decision" size="md">{newForm}</ModalButton> : undefined}
        />
      ) : (
        <ul className="space-y-4">
          {decisions.map((d) => {
            const author = d.author.name ?? d.author.email ?? "Someone";
            return (
              <li key={d.id} className="rounded-[var(--radius-card)] border border-border bg-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold tracking-tight">{d.title}</h2>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                      <Avatar name={author} size="sm" />
                      <span>{author}</span>
                      <span>·</span>
                      <span title={fmtDate(d.createdAt)}>{relTime(d.createdAt)}</span>
                      {d.project ? (
                        <Link href={`/projects/${d.project.id}`}><Pill tone="brand">{d.project.name}</Pill></Link>
                      ) : null}
                      {d.client ? (
                        <Link href={`/clients/${d.client.id}`}><Pill>{d.client.name}</Pill></Link>
                      ) : null}
                    </p>
                  </div>
                  {canWrite && (d.authorId === userId || isAdmin) ? (
                    <ActionButton action={deleteDecision} fields={{ id: d.id }} label="Delete" icon="trash" variant="ghost" onlyIcon confirm={`Delete "${d.title}"?`} />
                  ) : null}
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted">{d.body}</p>

                <details className="mt-4 border-t border-border pt-3">
                  <summary className="cursor-pointer text-xs font-medium text-brand">
                    {d.comments.length ? `${d.comments.length} comment${d.comments.length === 1 ? "" : "s"}` : "Add a comment"}
                  </summary>
                  {d.comments.length ? (
                    <ul className="mt-3 space-y-3">
                      {d.comments.map((c) => (
                        <li key={c.id} className="flex gap-2.5">
                          <Avatar name={c.author.name ?? c.author.email} size="sm" />
                          <div className="min-w-0 flex-1 rounded-[var(--radius-control)] bg-surface-2 px-3 py-2">
                            <p className="text-xs text-muted">
                              <span className="font-medium text-text">{c.author.name ?? c.author.email}</span> · {relTime(c.createdAt)}
                            </p>
                            <p className="mt-0.5 whitespace-pre-wrap text-sm">{c.body}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {canWrite ? (
                    <ActionForm action={addDecisionComment} submitLabel="Comment" className="mt-3" footerClassName="justify-end">
                      <input type="hidden" name="decisionId" value={d.id} />
                      <label>
                        <span className="sr-only">Comment</span>
                        <Textarea name="body" required maxLength={2000} placeholder="Add a comment…" className="min-h-16" />
                      </label>
                    </ActionForm>
                  ) : null}
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
