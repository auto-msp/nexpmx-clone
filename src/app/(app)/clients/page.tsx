import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { pageContext } from "@/lib/page";
import { planOf } from "@/lib/plans";
import { daysFromNow, fmtDate, inr, sp } from "@/lib/format";
import { Table, cx } from "@/components/ui";
import { EmptyPanel, HealthBadge, PageHeader, Pill, StatusBadge } from "@/components/kit";
import { ActionForm, ModalButton, ParamSelect, SearchInput, ViewToggle } from "@/components/kit-client";
import { Icon } from "@/components/kit-icons";
import { createClient } from "@/app/actions/clients";
import { ClientFields } from "@/components/clients/client-fields";
import { CLIENT_HEALTH_OPTIONS } from "@/components/clients/constants";
import { invoiceGrossMinor } from "@/components/projects/data";

export const metadata: Metadata = { title: "Clients", robots: { index: false } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function followUp(d: Date | null) {
  if (!d) return { text: "Not scheduled", overdue: false };
  const n = daysFromNow(d);
  return { text: fmtDate(d), overdue: n !== null && n < 0 };
}

export default async function ClientsPage({ searchParams }: { searchParams: SearchParams }) {
  const { orgId, canWrite } = await pageContext("client:write");
  const params = await searchParams;
  const q = sp(params.q).trim();
  const healthParam = sp(params.health);
  const statusParam = sp(params.status);
  const view = sp(params.view) === "table" ? "table" : "grid";

  const health = ["GOOD", "WATCH", "AT_RISK"].includes(healthParam) ? (healthParam as "GOOD" | "WATCH" | "AT_RISK") : null;
  const status = statusParam === "ARCHIVED" ? "ARCHIVED" : statusParam === "ALL" ? null : "ACTIVE";

  const where: Prisma.ClientWhereInput = {
    orgId,
    ...(status ? { status } : {}),
    ...(health ? { health } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { company: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { industry: { contains: q, mode: "insensitive" } },
            { city: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [clients, totalClients, activeClients, org] = await Promise.all([
    prisma.client.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      take: 300,
      include: { _count: { select: { projects: true, invoices: true } } },
    }),
    prisma.client.count({ where: { orgId } }),
    prisma.client.count({ where: { orgId, status: "ACTIVE" } }),
    prisma.organization.findUnique({ where: { id: orgId }, select: { plan: true } }),
  ]);
  const plan = planOf(org?.plan);
  const ids = clients.map((c) => c.id);

  const [activeProjectRows, openInvoices] = ids.length
    ? await Promise.all([
        prisma.project.groupBy({
          by: ["clientId"],
          where: { orgId, clientId: { in: ids }, status: { not: "COMPLETED" } },
          _count: { _all: true },
        }),
        prisma.invoice.findMany({
          where: { orgId, clientId: { in: ids }, status: { in: ["SENT", "OVERDUE"] } },
          select: { clientId: true, amountMinor: true, gstRateBps: true },
        }),
      ])
    : [[], []];
  const activeProjects = new Map<string, number>();
  for (const r of activeProjectRows) if (r.clientId) activeProjects.set(r.clientId, r._count._all);
  const outstanding = new Map<string, number>();
  for (const i of openInvoices) outstanding.set(i.clientId, (outstanding.get(i.clientId) ?? 0) + invoiceGrossMinor(i));

  const filtered = Boolean(q || health || statusParam);
  const atCap = plan.maxActiveClients !== null && activeClients >= plan.maxActiveClients;

  const newClient = canWrite ? (
    <ModalButton label="New client" icon="plus" title="New client" description="Add a client to your workspace." size="lg">
      <ActionForm action={createClient} submitLabel="Create client" pendingLabel="Creating…">
        <ClientFields />
      </ActionForm>
    </ModalButton>
  ) : null;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Clients"
        subtitle={
          plan.maxActiveClients !== null
            ? `Everyone you work with, in one place. ${activeClients} of ${plan.maxActiveClients} active clients used on the ${plan.name} plan.`
            : "Everyone you work with, in one place."
        }
        actions={newClient}
      />

      {atCap && canWrite ? (
        <p className="mb-4 rounded-[var(--radius-control)] border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
          You have reached the active-client limit of the {plan.name} plan. Archive a client or <Link href="/settings/plan" className="underline">upgrade your plan</Link> to add more.
        </p>
      ) : null}

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <SearchInput param="q" placeholder="Search clients" className="w-full sm:w-72" />
        <ParamSelect param="health" allLabel="All health" options={CLIENT_HEALTH_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} />
        <ParamSelect
          param="status"
          allLabel="Active clients"
          options={[
            { value: "ARCHIVED", label: "Archived" },
            { value: "ALL", label: "Active and archived" },
          ]}
        />
        <div className="ml-auto">
          <ViewToggle />
        </div>
      </div>

      {clients.length === 0 ? (
        filtered || totalClients > 0 ? (
          <EmptyPanel
            icon="search"
            title="No clients match these filters"
            hint="Try a different search, or clear the filters to see everyone."
            action={
              <Link href="/clients" className="text-sm text-brand hover:underline">
                Clear filters
              </Link>
            }
          />
        ) : (
          <EmptyPanel
            icon="building"
            title="No clients yet"
            hint="Add your first client to start tracking projects, invoices and conversations against them."
            action={newClient}
          />
        )
      ) : view === "table" ? (
        <Table head={["Client", "Industry", "Health", "Active projects", "Outstanding", "Next follow-up", "Status"]}>
          {clients.map((c) => {
            const f = followUp(c.nextFollowUpAt);
            return (
              <tr key={c.id} className="hover:bg-surface-2/40">
                <td className="px-4 py-3">
                  <Link href={`/clients/${c.id}`} className="font-medium hover:text-brand">
                    {c.name}
                  </Link>
                  <div className="text-xs text-muted">{c.company ?? c.email ?? "—"}</div>
                </td>
                <td className="px-4 py-3 text-muted">{c.industry ?? "—"}</td>
                <td className="px-4 py-3"><HealthBadge health={c.health} /></td>
                <td className="px-4 py-3 text-muted">{activeProjects.get(c.id) ?? 0}</td>
                <td className="px-4 py-3">{inr(outstanding.get(c.id) ?? 0)}</td>
                <td className={cx("px-4 py-3", f.overdue ? "text-danger" : "text-muted")}>{f.text}</td>
                <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
              </tr>
            );
          })}
        </Table>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((c) => {
            const f = followUp(c.nextFollowUpAt);
            const owed = outstanding.get(c.id) ?? 0;
            return (
              <Link
                key={c.id}
                href={`/clients/${c.id}`}
                className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4 transition-colors hover:border-brand"
              >
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-brand/15 text-sm font-semibold text-brand"
                  >
                    {initialsOf(c.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{c.name}</div>
                    <div className="truncate text-xs text-muted">{c.company ?? c.email ?? "No company on file"}</div>
                    {c.industry ? <div className="mt-1"><Pill>{c.industry}</Pill></div> : null}
                  </div>
                  <HealthBadge health={c.health} />
                </div>
                <dl className="grid grid-cols-2 gap-2 border-t border-border pt-3 text-xs">
                  <div>
                    <dt className="text-muted">Active projects</dt>
                    <dd className="mt-0.5 flex items-center gap-1 font-medium">
                      <Icon name="folder" className="h-3.5 w-3.5 text-muted" />
                      {activeProjects.get(c.id) ?? 0}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Outstanding</dt>
                    <dd className={cx("mt-0.5 font-medium", owed > 0 && "text-warn")}>{inr(owed)}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-muted">Next follow-up</dt>
                    <dd className={cx("mt-0.5 flex items-center gap-1 font-medium", f.overdue && "text-danger")}>
                      <Icon name="calendar" className="h-3.5 w-3.5" />
                      {f.text}
                      {f.overdue ? <span className="text-[10px] uppercase tracking-wide">overdue</span> : null}
                    </dd>
                  </div>
                </dl>
                {c.status === "ARCHIVED" ? <div className="text-[11px] uppercase tracking-wide text-muted">Archived</div> : null}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
