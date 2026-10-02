import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { pageContext } from "@/lib/page";
import { sp, fmtDate, relTime } from "@/lib/format";
import { PageHeader, KpiGrid, KpiTile, Panel, EmptyPanel, Avatar } from "@/components/kit";
import { SearchInput } from "@/components/kit-client";
import { Icon } from "@/components/kit-icons";
import { ButtonLink, cx } from "@/components/ui";
import { LogCommsButton } from "@/components/docs/log-comms-button";
import { CHANNELS, CommsBubble, CommsListItem, type CommsRow } from "@/components/docs/comms-ui";

export const metadata: Metadata = { title: "Comms", robots: { index: false } };

const LIMIT = 200;

type Search = Record<string, string | string[] | undefined>;

export default async function CommsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const raw = await searchParams;
  const q = sp(raw.q).trim();
  const clientParam = sp(raw.client);
  const channelParam = CHANNELS.some((c) => c.value === sp(raw.channel)) ? sp(raw.channel) : "";
  const directionParam = sp(raw.direction) === "IN" || sp(raw.direction) === "OUT" ? sp(raw.direction) : "";

  const { orgId, canWrite } = await pageContext("comms:write");

  const clients = await prisma.client.findMany({
    where: { orgId },
    select: { id: true, name: true, status: true },
    orderBy: { name: "asc" },
  });
  const activeClient = clientParam && clientParam !== "general" ? clients.find((c) => c.id === clientParam) ?? null : null;
  const generalOnly = clientParam === "general";

  const where: Prisma.CommsMessageWhereInput = {
    orgId,
    ...(activeClient ? { clientId: activeClient.id } : {}),
    ...(generalOnly ? { clientId: null } : {}),
    ...(channelParam ? { channel: channelParam } : {}),
    ...(directionParam ? { direction: directionParam } : {}),
    ...(q ? { OR: [{ subject: { contains: q, mode: "insensitive" } }, { body: { contains: q, mode: "insensitive" } }] } : {}),
  };

  const since = new Date(Date.now() - 30 * 86_400_000);
  const [messages, matchCount, perClient, perChannel, monthOut, monthIn, contactedClients, total] = await Promise.all([
    prisma.commsMessage.findMany({
      where,
      orderBy: { sentAt: "desc" },
      take: LIMIT,
      include: { client: { select: { name: true } } },
    }),
    prisma.commsMessage.count({ where }),
    prisma.commsMessage.groupBy({ by: ["clientId"], where: { orgId }, _count: { _all: true } }),
    prisma.commsMessage.groupBy({ by: ["channel"], where: { orgId }, _count: { _all: true } }),
    prisma.commsMessage.count({ where: { orgId, direction: "OUT", sentAt: { gte: since } } }),
    prisma.commsMessage.count({ where: { orgId, direction: "IN", sentAt: { gte: since } } }),
    prisma.commsMessage.groupBy({ by: ["clientId"], where: { orgId, clientId: { not: null }, sentAt: { gte: since } } }),
    prisma.commsMessage.count({ where: { orgId } }),
  ]);

  const rows: CommsRow[] = messages.map((m) => ({
    id: m.id,
    channel: m.channel,
    direction: m.direction,
    subject: m.subject,
    body: m.body,
    sentAt: m.sentAt,
    clientId: m.clientId,
    clientName: m.client?.name ?? null,
  }));
  if (activeClient) rows.reverse(); // threads read oldest to newest

  const clientCount = new Map(perClient.map((c) => [c.clientId ?? "general", c._count._all]));
  const channelCount = new Map(perChannel.map((c) => [c.channel, c._count._all]));
  const filterable = clients.filter((c) => (clientCount.get(c.id) ?? 0) > 0 || c.id === activeClient?.id);

  const link = (over: Record<string, string | undefined>) => {
    const next: Record<string, string | undefined> = { q: q || undefined, client: clientParam || undefined, channel: channelParam || undefined, direction: directionParam || undefined, ...over };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) qs.set(k, v);
    const s = qs.toString();
    return s ? `/comms?${s}` : "/comms";
  };

  const filterLink = (label: string, to: string, active: boolean, count?: number, icon?: string) => (
    <Link
      key={label + to}
      href={to}
      aria-current={active ? "page" : undefined}
      className={cx(
        "flex items-center justify-between gap-2 rounded-[var(--radius-control)] px-2.5 py-1.5 text-sm",
        active ? "bg-brand/15 font-medium text-brand" : "text-muted hover:bg-surface-2 hover:text-text",
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        {icon ? <Icon name={icon} className="h-4 w-4 shrink-0" /> : null}
        <span className="truncate">{label}</span>
      </span>
      {count !== undefined ? <span className="text-xs tabular-nums">{count}</span> : null}
    </Link>
  );

  const loggable = clients.filter((c) => c.status === "ACTIVE");
  const anyFilter = Boolean(q || clientParam || channelParam || directionParam);

  const lastTouch = activeClient && rows.length > 0 ? rows[rows.length - 1] : null;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={activeClient ? activeClient.name : "Conversations"}
        eyebrow={activeClient ? "Client thread" : undefined}
        back={activeClient ? { href: link({ client: undefined }), label: "All conversations" } : undefined}
        subtitle={
          activeClient
            ? "Everything logged with this client, oldest first."
            : "Every email, call, meeting and note with your clients, in one searchable log."
        }
        actions={
          <>
            <ButtonLink href="/ai/skills" variant="secondary">
              <Icon name="sparkle" className="h-4 w-4" />
              Draft with AI
            </ButtonLink>
            {activeClient ? (
              <ButtonLink href={`/clients/${activeClient.id}`} variant="secondary">
                <Icon name="building" className="h-4 w-4" />
                Open client
              </ButtonLink>
            ) : null}
            {canWrite ? <LogCommsButton clients={loggable} defaultClientId={activeClient?.id} /> : null}
          </>
        }
      />

      <KpiGrid cols={4}>
        <KpiTile label="Total logged" value={total} icon="mail" hint="All time" />
        <KpiTile label="Sent, last 30 days" value={monthOut} icon="send" tone="brand" />
        <KpiTile label="Received, last 30 days" value={monthIn} icon="mail" />
        <KpiTile label="Clients in touch" value={contactedClients.length} hint="Contacted in the last 30 days" icon="users" tone="success" />
      </KpiGrid>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <Panel title="Channel" flush>
            <nav className="space-y-0.5 p-2" aria-label="Filter by channel">
              {filterLink("All channels", link({ channel: undefined }), !channelParam, total, "list")}
              {CHANNELS.map((c) => filterLink(c.label, link({ channel: c.value }), channelParam === c.value, channelCount.get(c.value) ?? 0, c.icon))}
            </nav>
          </Panel>
          <Panel title="Direction" flush>
            <nav className="space-y-0.5 p-2" aria-label="Filter by direction">
              {filterLink("Both ways", link({ direction: undefined }), !directionParam)}
              {filterLink("Sent by us", link({ direction: "OUT" }), directionParam === "OUT", undefined, "send")}
              {filterLink("Received", link({ direction: "IN" }), directionParam === "IN", undefined, "mail")}
            </nav>
          </Panel>
          <Panel title="Client" flush>
            <nav className="max-h-72 space-y-0.5 overflow-y-auto p-2" aria-label="Filter by client">
              {filterLink("All clients", link({ client: undefined }), !clientParam)}
              {clientCount.has("general") ? filterLink("General", link({ client: "general" }), generalOnly, clientCount.get("general")) : null}
              {filterable.map((c) => filterLink(c.name, link({ client: c.id }), activeClient?.id === c.id, clientCount.get(c.id) ?? 0, "building"))}
            </nav>
          </Panel>
        </aside>

        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput param="q" placeholder="Search subject or details…" className="min-w-0 flex-1 basis-56" />
            {anyFilter ? (
              <ButtonLink href="/comms" variant="ghost">
                Clear filters
              </ButtonLink>
            ) : null}
          </div>

          {activeClient ? (
            <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4">
              <Avatar name={activeClient.name} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{activeClient.name}</p>
                <p className="text-xs text-muted">
                  {matchCount} entr{matchCount === 1 ? "y" : "ies"}
                  {lastTouch ? ` · last contact ${relTime(lastTouch.sentAt)} (${fmtDate(lastTouch.sentAt)})` : ""}
                </p>
              </div>
            </div>
          ) : null}

          {rows.length === 0 ? (
            total === 0 ? (
              <EmptyPanel
                icon="mail"
                title="Nothing logged yet"
                hint="Log the first email, call or meeting to start the conversation history. It becomes part of the business memory."
                action={canWrite ? <LogCommsButton clients={loggable} label="Log your first message" /> : undefined}
              />
            ) : (
              <EmptyPanel icon="search" title="No conversations match" hint="Try another channel or client, or clear the filters." action={<ButtonLink href="/comms" variant="secondary">Clear filters</ButtonLink>} />
            )
          ) : activeClient ? (
            <ul className="space-y-3">
              {rows.map((m) => (
                <CommsBubble key={m.id} m={m} canWrite={canWrite} />
              ))}
            </ul>
          ) : (
            <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
              <ul className="divide-y divide-border">
                {rows.map((m) => (
                  <CommsListItem key={m.id} m={m} canWrite={canWrite} showClient />
                ))}
              </ul>
            </div>
          )}
          {matchCount > LIMIT ? <p className="text-center text-xs text-muted">Showing the most recent {LIMIT} of {matchCount} entries. Narrow the filters to see others.</p> : null}
        </div>
      </div>
    </div>
  );
}
