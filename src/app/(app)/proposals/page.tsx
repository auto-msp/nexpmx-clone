import type { Metadata } from "next";
import Link from "next/link";
import { pageContext } from "@/lib/page";
import { prisma } from "@/lib/db";
import { inr, fmtDate, sp } from "@/lib/format";
import { ButtonLink } from "@/components/ui";
import { PageHeader, KpiGrid, KpiTile, TabLinks, EmptyPanel, StatusBadge } from "@/components/kit";
import { SearchInput, ActionButton } from "@/components/kit-client";
import { Icon } from "@/components/kit-icons";
import { MiniLink } from "@/components/finance/mini-link";
import { PROPOSAL_STATUS_TABS } from "@/components/finance/constants";
import { markProposalSent, deleteProposal } from "@/app/actions/proposals";

export const metadata: Metadata = { title: "Proposals", robots: { index: false } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ProposalsPage({ searchParams }: { searchParams: SearchParams }) {
  const { orgId, canWrite } = await pageContext("invoice:write");
  const params = await searchParams;
  const status = sp(params.status).toUpperCase();
  const activeStatus = (PROPOSAL_STATUS_TABS as readonly string[]).includes(status) ? status : "";
  const q = sp(params.q).trim().toLowerCase();

  const all = await prisma.proposal.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      amountMinor: true,
      status: true,
      validUntil: true,
      sentAt: true,
      advancePct: true,
      createdAt: true,
      summary: true,
      client: { select: { name: true } },
    },
  });

  const sum = (rows: typeof all) => rows.reduce((s, p) => s + p.amountMinor, 0);
  const by = (st: string[]) => all.filter((p) => st.includes(p.status));
  const open = by(["DRAFT", "SENT", "VIEWED"]);
  const awaiting = by(["SENT", "VIEWED"]);
  const won = by(["ACCEPTED"]);
  const lost = by(["REJECTED"]);
  const decided = won.length + lost.length;
  const winRate = decided > 0 ? Math.round((won.length / decided) * 100) : null;

  const visible = all.filter(
    (p) => (!activeStatus || p.status === activeStatus) && (!q || p.title.toLowerCase().includes(q) || (p.client?.name ?? "").toLowerCase().includes(q)),
  );

  const href = (s: string) => {
    const u = new URLSearchParams();
    if (s) u.set("status", s.toLowerCase());
    if (q) u.set("q", q);
    const qs = u.toString();
    return qs ? `/proposals?${qs}` : "/proposals";
  };
  const tabs = [
    { href: href(""), label: "All", active: !activeStatus, count: all.length },
    ...PROPOSAL_STATUS_TABS.map((s) => ({
      href: href(s),
      label: s.charAt(0) + s.slice(1).toLowerCase(),
      active: activeStatus === s,
      count: all.filter((p) => p.status === s).length,
    })),
  ];
  const now = Date.now();

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Proposals"
        subtitle="Draft, send and track proposals through to signature. Accepted proposals turn into an advance invoice in one click."
        actions={canWrite ? <ButtonLink href="/proposals/new"><Icon name="plus" />New proposal</ButtonLink> : undefined}
      />

      <KpiGrid cols={4}>
        <KpiTile label="Pipeline value" value={inr(sum(open))} hint={`${open.length} open proposal${open.length === 1 ? "" : "s"}`} icon="chart" tone="brand" />
        <KpiTile label="Awaiting signature" value={inr(sum(awaiting))} hint={`${awaiting.length} sent or viewed`} icon="send" tone="warn" />
        <KpiTile label="Win rate" value={winRate === null ? "—" : `${winRate}%`} hint={decided ? `${won.length} of ${decided} decided` : "No decisions yet"} icon="target" tone="success" />
        <KpiTile label="Won value" value={inr(sum(won))} hint={`${won.length} accepted`} icon="check" tone="success" />
      </KpiGrid>

      <TabLinks tabs={tabs} />
      <div className="mb-4 max-w-md">
        <SearchInput param="q" placeholder="Search by title or client" />
      </div>

      {all.length === 0 ? (
        <EmptyPanel
          icon="file"
          title="No proposals yet"
          hint="Create your first proposal and send it for signature."
          action={canWrite ? <ButtonLink href="/proposals/new"><Icon name="plus" />New proposal</ButtonLink> : undefined}
        />
      ) : visible.length === 0 ? (
        <EmptyPanel icon="search" title="No proposals match" hint="Try another status tab or clear the search." />
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((p) => {
            const expired = p.validUntil && p.validUntil.getTime() < now && ["DRAFT", "SENT", "VIEWED"].includes(p.status);
            return (
              <li key={p.id} className="rounded-[var(--radius-card)] border border-border bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/proposals/${p.id}`} className="truncate font-medium hover:text-brand">
                        {p.title}
                      </Link>
                      <StatusBadge status={p.status} />
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {p.client?.name ?? "No client"} · {p.advancePct}% advance
                      {p.sentAt ? ` · sent ${fmtDate(p.sentAt)}` : ` · created ${fmtDate(p.createdAt)}`}
                      {p.validUntil ? (
                        <span className={expired ? "text-warn" : undefined}> · {expired ? "expired" : "valid until"} {fmtDate(p.validUntil)}</span>
                      ) : null}
                    </p>
                    {p.summary ? <p className="mt-1 line-clamp-1 text-xs text-muted">{p.summary}</p> : null}
                  </div>
                  <div className="text-right text-lg font-semibold tabular-nums">{inr(p.amountMinor)}</div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-border pt-2">
                  <MiniLink href={`/proposals/${p.id}`} icon="eye" label="View" />
                  {canWrite && p.status === "DRAFT" ? (
                    <ActionButton action={markProposalSent} fields={{ id: p.id }} label="Send" icon="send" confirm="Mark this proposal as sent?" />
                  ) : null}
                  {canWrite && !["ACCEPTED", "REJECTED"].includes(p.status) ? <MiniLink href={`/proposals/${p.id}/edit`} icon="edit" label="Edit" /> : null}
                  {canWrite ? (
                    <ActionButton action={deleteProposal} fields={{ id: p.id }} label="Delete" icon="trash" variant="ghost" confirm={`Delete “${p.title}”? This cannot be undone.`} />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
