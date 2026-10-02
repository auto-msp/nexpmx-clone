import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { pageContext, orgMembers } from "@/lib/page";
import { fmtDateTime, sp } from "@/lib/format";
import { PageHeader, Panel, EmptyPanel } from "@/components/kit";
import { Badge, Button, ButtonLink, Field, Input, Select } from "@/components/ui";

export const metadata: Metadata = { title: "Audit log", robots: { index: false } };

const PAGE_SIZE = 40;

function metaChips(json: string): Array<[string, string]> {
  try {
    const obj = JSON.parse(json) as Record<string, unknown>;
    return Object.entries(obj)
      .slice(0, 5)
      .map(([k, v]) => [k, typeof v === "object" ? JSON.stringify(v) : String(v)] as [string, string]);
  } catch {
    return [];
  }
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const action = sp(raw.action).trim();
  const entity = sp(raw.entity).trim();
  const actor = sp(raw.actor).trim();
  const pageNum = Math.max(1, parseInt(sp(raw.page) || "1", 10) || 1);

  const { orgId } = await pageContext();

  const where: Prisma.AuditLogWhereInput = {
    orgId,
    ...(action ? { action: { contains: action, mode: "insensitive" } } : {}),
    ...(entity ? { entity } : {}),
    ...(actor === "system" ? { actorId: null } : actor ? { actorId: actor } : {}),
  };

  const [logs, total, entities, members] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (pageNum - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.groupBy({ by: ["entity"], where: { orgId }, orderBy: { entity: "asc" } }),
    orgMembers(orgId),
  ]);

  const nameOf = new Map(members.map((m) => [m.id, m.name ?? m.email]));
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = Boolean(action || entity || actor);

  const pageHref = (n: number) => {
    const qs = new URLSearchParams();
    if (action) qs.set("action", action);
    if (entity) qs.set("entity", entity);
    if (actor) qs.set("actor", actor);
    if (n > 1) qs.set("page", String(n));
    const s = qs.toString();
    return s ? `/settings/audit?${s}` : "/settings/audit";
  };

  return (
    <>
      <PageHeader title="Audit log" subtitle={`Every change in this workspace: who, what and when. ${total.toLocaleString("en-IN")} event${total === 1 ? "" : "s"}${filtered ? " match" : " in total"}.`} />

      <form method="GET" className="mb-4 grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]">
        <Field label="Action contains">
          <Input name="action" defaultValue={action} placeholder="invoice., member., ai." />
        </Field>
        <Field label="Entity">
          <Select name="entity" defaultValue={entity}>
            <option value="">All entities</option>
            {entities.map((e) => (
              <option key={e.entity} value={e.entity}>
                {e.entity}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Who">
          <Select name="actor" defaultValue={actor}>
            <option value="">Anyone</option>
            <option value="system">System</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name ?? m.email}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex gap-2">
          <Button type="submit" variant="secondary">
            Apply
          </Button>
          {filtered ? (
            <ButtonLink href="/settings/audit" variant="ghost">
              Clear
            </ButtonLink>
          ) : null}
        </div>
      </form>

      {logs.length === 0 ? (
        <EmptyPanel icon="clock" title="No events match" hint={filtered ? "Try clearing a filter." : "Changes made in the workspace will appear here."} />
      ) : (
        <Panel flush>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2/60 text-xs uppercase tracking-wider text-muted">
                  <th className="px-4 py-3 font-medium">When</th>
                  <th className="px-4 py-3 font-medium">Who</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Entity</th>
                  <th className="px-4 py-3 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap px-4 py-2.5 text-muted">{fmtDateTime(l.createdAt)}</td>
                    <td className="px-4 py-2.5">
                      {l.actorId ? <span className="text-sm">{nameOf.get(l.actorId) ?? "Former member"}</span> : <Badge tone="warn">system</Badge>}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">{l.action}</td>
                    <td className="px-4 py-2.5 text-muted">{l.entity}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex max-w-72 flex-wrap gap-1">
                        {metaChips(l.metaJson).map(([k, v]) => (
                          <span key={k} className="max-w-full truncate rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted" title={`${k}: ${v}`}>
                            {k}: {v}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {pages > 1 ? (
        <div className="mt-4 flex items-center justify-between gap-3 text-sm text-muted">
          <span>
            Page {pageNum} of {pages}
          </span>
          <span className="flex gap-2">
            {pageNum > 1 ? (
              <ButtonLink href={pageHref(pageNum - 1)} variant="secondary">
                Newer
              </ButtonLink>
            ) : null}
            {pageNum < pages ? (
              <ButtonLink href={pageHref(pageNum + 1)} variant="secondary">
                Older
              </ButtonLink>
            ) : null}
          </span>
        </div>
      ) : null}
    </>
  );
}
