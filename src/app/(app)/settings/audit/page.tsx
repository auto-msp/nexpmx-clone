import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getOrgContext } from "@/lib/tenancy";
import { prisma } from "@/lib/db";
import { Badge, Card, EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "Audit log", robots: { index: false } };

const PAGE_SIZE = 50;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; action?: string }>;
}) {
  const { page, action } = await searchParams;
  const session = await auth();
  const ctx = await getOrgContext(session!.user!.id);
  const pageNum = Math.max(1, parseInt(page ?? "1", 10) || 1);

  const where = {
    orgId: ctx!.orgId,
    ...(action ? { action: { contains: action } } : {}),
  };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (pageNum - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.auditLog.count({ where }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="mt-1 text-sm text-muted">
          Every mutation in this workspace — who, what, when. {total} event{total === 1 ? "" : "s"} total.
        </p>
      </div>

      <form method="GET" className="flex items-end gap-2">
        <label className="text-xs text-muted">
          Filter by action
          <input
            name="action"
            defaultValue={action ?? ""}
            placeholder="invoice., memory., automation."
            className="mt-1 block w-64 rounded-[var(--radius-control)] border border-border bg-surface-2 px-3 py-1.5 text-sm text-text placeholder:text-muted/60 focus:border-brand focus:outline-none"
          />
        </label>
        <button
          type="submit"
          className="rounded-[var(--radius-control)] border border-border px-3 py-1.5 text-xs text-muted hover:border-brand hover:text-text"
        >
          Apply
        </button>
      </form>

      {logs.length === 0 ? (
        <EmptyState title="No events match" hint="Try clearing the action filter." />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2/60 text-xs uppercase tracking-wider text-muted">
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Actor</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Entity</th>
                <th className="px-4 py-3 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap px-4 py-2.5 text-muted">
                    {l.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="px-4 py-2.5 text-muted">
                    {l.actorId ? <Badge tone="neutral">member</Badge> : <Badge tone="warn">system</Badge>}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">{l.action}</td>
                  <td className="px-4 py-2.5 text-muted">{l.entity}</td>
                  <td className="max-w-64 truncate px-4 py-2.5 text-xs text-muted">
                    {l.metaJson !== "{}" ? l.metaJson : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 ? (
        <div className="flex items-center gap-3 text-sm text-muted">
          {pageNum > 1 ? (
            <Link
              href={`/settings/audit?page=${pageNum - 1}${action ? `&action=${encodeURIComponent(action)}` : ""}`}
              className="text-brand hover:underline"
            >
              ← Newer
            </Link>
          ) : null}
          <span>
            Page {pageNum} of {pages}
          </span>
          {pageNum < pages ? (
            <Link
              href={`/settings/audit?page=${pageNum + 1}${action ? `&action=${encodeURIComponent(action)}` : ""}`}
              className="text-brand hover:underline"
            >
              Older →
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
