import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { orgMembers, pageContext } from "@/lib/page";
import { appUrl } from "@/lib/mail";
import { daysFromNow, fmtDate, fmtDateTime, inr, relTime, sp } from "@/lib/format";
import { Badge, ButtonLink, Field, Input, Table, Textarea, cx } from "@/components/ui";
import {
  Avatar,
  DetailRow,
  EmptyPanel,
  HealthBadge,
  KpiGrid,
  KpiTile,
  PageHeader,
  Panel,
  ProgressBar,
  StatusBadge,
  TabLinks,
} from "@/components/kit";
import { ActionButton, ActionForm, CopyButton, ModalButton } from "@/components/kit-client";
import { Icon } from "@/components/kit-icons";
import {
  addClientComment,
  archiveClient,
  createPortalInvite,
  deleteClient,
  restoreClient,
  revokePortalInvite,
  updateClient,
} from "@/app/actions/clients";
import { createProject } from "@/app/actions/projects";
import { ClientFields } from "@/components/clients/client-fields";
import { ProjectFields } from "@/components/projects/project-fields";
import { projectTypeLabel } from "@/components/projects/constants";
import { invoiceGrossMinor } from "@/components/projects/data";

export const metadata: Metadata = { title: "Client", robots: { index: false } };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const TABS = [
  ["overview", "Overview"],
  ["projects", "Projects"],
  ["invoices", "Invoices"],
  ["proposals", "Proposals"],
  ["documents", "Documents"],
  ["comms", "Comms"],
  ["portal", "Portal"],
  ["activity", "Activity"],
] as const;
type TabKey = (typeof TABS)[number][0];

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default async function ClientDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const query = await searchParams;
  const { orgId, canWrite, role } = await pageContext("client:write");
  const canDelete = role === "OWNER" || role === "ADMIN";
  const tabParam = sp(query.tab);
  const tab: TabKey = (TABS.find(([k]) => k === tabParam)?.[0] ?? "overview") as TabKey;

  const client = await prisma.client.findFirst({ where: { id, orgId } });
  if (!client) notFound();

  const [invoices, projectCount, proposalCount, documentCount, commsCount, lastComm] = await Promise.all([
    prisma.invoice.findMany({
      where: { orgId, clientId: id },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, number: true, status: true, amountMinor: true, gstRateBps: true, issuedAt: true, dueAt: true, createdAt: true },
    }),
    prisma.project.count({ where: { orgId, clientId: id } }),
    prisma.proposal.count({ where: { orgId, clientId: id } }),
    prisma.document.count({ where: { orgId, clientId: id } }),
    prisma.commsMessage.count({ where: { orgId, clientId: id } }),
    prisma.commsMessage.findFirst({ where: { orgId, clientId: id }, orderBy: { sentAt: "desc" }, select: { sentAt: true } }),
  ]);

  let billed = 0;
  let outstanding = 0;
  let overdue = 0;
  for (const i of invoices) {
    const g = invoiceGrossMinor(i);
    if (i.status !== "DRAFT") billed += g;
    if (i.status === "SENT" || i.status === "OVERDUE") outstanding += g;
    if (i.status === "OVERDUE") overdue += g;
  }

  const portalUrl = `${appUrl()}/portal/${client.portalToken}`;
  const followDays = daysFromNow(client.nextFollowUpAt);
  const base = `/clients/${id}`;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        back={{ href: "/clients", label: "All clients" }}
        title={
          <span className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-brand/15 text-sm font-semibold text-brand"
            >
              {initialsOf(client.name)}
            </span>
            <span className="truncate">{client.name}</span>
            <HealthBadge health={client.health} />
            {client.status === "ARCHIVED" ? <StatusBadge status="ARCHIVED" /> : null}
          </span>
        }
        subtitle={[client.company, client.industry].filter(Boolean).join(" · ") || undefined}
        actions={
          <>
            <CopyButton text={portalUrl} label="Copy portal link" />
            {canWrite ? (
              <ButtonLink href={`${base}?tab=portal`} variant="secondary">
                <Icon name="mail" className="h-4 w-4" /> Invite to portal
              </ButtonLink>
            ) : null}
            {canWrite ? (
              <ModalButton label="Edit" icon="edit" variant="secondary" title="Edit client" description="Update details, billing information and status." size="lg">
                <ActionForm action={updateClient} submitLabel="Save changes" resetOnSuccess={false}>
                  <ClientFields client={client} />
                </ActionForm>
              </ModalButton>
            ) : null}
            {canWrite ? (
              client.status === "ACTIVE" ? (
                <ActionButton
                  action={archiveClient}
                  fields={{ id }}
                  label="Archive"
                  icon="folder"
                  variant="secondary"
                  confirm="Archive this client? They stay in your records but leave the active list."
                  className="px-4 py-2 text-sm"
                />
              ) : (
                <ActionButton action={restoreClient} fields={{ id }} label="Restore" icon="check" variant="secondary" className="px-4 py-2 text-sm" />
              )
            ) : null}
            {canDelete ? (
              <ActionButton
                action={deleteClient}
                fields={{ id }}
                label="Delete"
                icon="trash"
                variant="danger"
                confirm="Delete this client permanently? Projects stay but lose the client link. This cannot be undone."
                className="px-4 py-2 text-sm"
              />
            ) : null}
          </>
        }
      />

      <KpiGrid>
        <KpiTile label="Projects" value={projectCount} icon="folder" hint="Total linked to this client" />
        <KpiTile label="Billed" value={inr(billed)} icon="receipt" hint="Sent, paid and overdue invoices" />
        <KpiTile
          label="Outstanding"
          value={inr(outstanding)}
          icon="wallet"
          tone={overdue > 0 ? "danger" : outstanding > 0 ? "warn" : "neutral"}
          hint={overdue > 0 ? `${inr(overdue)} overdue` : "Awaiting payment"}
        />
        <KpiTile label="Last contact" value={lastComm ? relTime(lastComm.sentAt) : "None yet"} icon="mail" hint={lastComm ? fmtDate(lastComm.sentAt) : "Nothing logged in Comms"} />
      </KpiGrid>

      <TabLinks
        tabs={TABS.map(([k, label]) => ({
          href: `${base}?tab=${k}`,
          label,
          active: tab === k,
          count:
            k === "projects" ? projectCount
            : k === "invoices" ? invoices.length
            : k === "proposals" ? proposalCount
            : k === "documents" ? documentCount
            : k === "comms" ? commsCount
            : undefined,
        }))}
      />

      {tab === "overview" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Panel title="Contact details">
              <div className="divide-y divide-border">
                <DetailRow label="Email">{client.email ? <a className="text-brand hover:underline" href={`mailto:${client.email}`}>{client.email}</a> : "—"}</DetailRow>
                <DetailRow label="Phone">{client.phone ?? "—"}</DetailRow>
                <DetailRow label="Website">
                  {client.website ? (
                    <a className="text-brand hover:underline" href={client.website} target="_blank" rel="noopener noreferrer">
                      {client.website.replace(/^https?:\/\//, "")}
                    </a>
                  ) : "—"}
                </DetailRow>
                <DetailRow label="Industry">{client.industry ?? "—"}</DetailRow>
                <DetailRow label="Source">{client.source ?? "—"}</DetailRow>
              </div>
            </Panel>
            <Panel title="Billing and GST">
              <div className="divide-y divide-border">
                <DetailRow label="GSTIN"><span className="font-mono text-xs">{client.gstin ?? "—"}</span></DetailRow>
                <DetailRow label="Payment terms">{client.paymentTermsDays} days</DetailRow>
                <DetailRow label="Billing address"><span className="whitespace-pre-line">{client.billingAddress ?? "—"}</span></DetailRow>
                <DetailRow label="State">{client.state ?? "—"}</DetailRow>
                <DetailRow label="City">{client.city ?? "—"}</DetailRow>
                <DetailRow label="Pincode">{client.pincode ?? "—"}</DetailRow>
              </div>
              {!client.gstin || !client.billingAddress ? (
                <p className="mt-3 rounded-[var(--radius-control)] bg-warn/10 px-3 py-2 text-xs text-warn">
                  GSTIN or billing address is missing, so invoices to this client will be incomplete. Edit the client to add them.
                </p>
              ) : null}
            </Panel>
            <Panel title="Internal notes">
              {client.notes ? <p className="whitespace-pre-line text-sm">{client.notes}</p> : <p className="text-sm text-muted">No notes yet. Use Edit to add private context for your team.</p>}
            </Panel>
          </div>
          <div className="space-y-4">
            <Panel title="Next follow-up">
              {client.nextFollowUpAt ? (
                <>
                  <div className={cx("text-lg font-semibold", followDays !== null && followDays < 0 && "text-danger")}>{fmtDate(client.nextFollowUpAt)}</div>
                  <p className="mt-1 text-xs text-muted">
                    {followDays === null ? "" : followDays < 0 ? `${Math.abs(followDays)} days overdue` : followDays === 0 ? "Due today" : `In ${followDays} days`}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted">No follow-up scheduled. Set one from Edit to keep this account from going quiet.</p>
              )}
            </Panel>
            <Panel title="Account">
              <div className="divide-y divide-border">
                <DetailRow label="Health"><HealthBadge health={client.health} /></DetailRow>
                <DetailRow label="Status"><StatusBadge status={client.status} /></DetailRow>
                <DetailRow label="Client since">{fmtDate(client.createdAt)}</DetailRow>
                <DetailRow label="Last updated">{relTime(client.updatedAt)}</DetailRow>
              </div>
            </Panel>
          </div>
        </div>
      ) : null}

      {tab === "projects" ? <ProjectsTab orgId={orgId} clientId={id} canWrite={canWrite} /> : null}
      {tab === "invoices" ? (
        <Panel
          title="Invoices"
          flush
          action={
            canWrite ? (
              <ButtonLink href={`/invoices/new?clientId=${id}`} variant="secondary" className="px-3 py-1.5 text-xs">
                <Icon name="plus" className="h-3.5 w-3.5" /> New invoice
              </ButtonLink>
            ) : undefined
          }
        >
          {invoices.length === 0 ? (
            <div className="p-5">
              <EmptyPanel icon="receipt" title="No invoices yet" hint="Invoices raised for this client will be listed here." />
            </div>
          ) : (
            <Table head={["Invoice", "Status", "Amount (incl. GST)", "Issued", "Due"]}>
              {invoices.map((i) => (
                <tr key={i.id} className="hover:bg-surface-2/40">
                  <td className="px-4 py-3"><Link href={`/invoices/${i.id}`} className="font-medium hover:text-brand">{i.number}</Link></td>
                  <td className="px-4 py-3"><StatusBadge status={i.status} /></td>
                  <td className="px-4 py-3">{inr(invoiceGrossMinor(i))}</td>
                  <td className="px-4 py-3 text-muted">{fmtDate(i.issuedAt)}</td>
                  <td className="px-4 py-3 text-muted">{fmtDate(i.dueAt)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
      ) : null}
      {tab === "proposals" ? <ProposalsTab orgId={orgId} clientId={id} /> : null}
      {tab === "documents" ? <DocumentsTab orgId={orgId} clientId={id} /> : null}
      {tab === "comms" ? <CommsTab orgId={orgId} clientId={id} /> : null}
      {tab === "portal" ? <PortalTab orgId={orgId} clientId={id} portalUrl={portalUrl} canWrite={canWrite} /> : null}
      {tab === "activity" ? <ActivityTab orgId={orgId} clientId={id} canComment /> : null}
    </div>
  );
}

/* ── Tabs ───────────────────────────────────────────────────────────────── */

async function ProjectsTab({ orgId, clientId, canWrite }: { orgId: string; clientId: string; canWrite: boolean }) {
  const [projects, taskGroups, client] = await Promise.all([
    prisma.project.findMany({ where: { orgId, clientId }, orderBy: { updatedAt: "desc" }, take: 100 }),
    prisma.task.groupBy({ by: ["projectId", "status"], where: { orgId, project: { clientId } }, _count: { _all: true } }),
    prisma.client.findFirst({ where: { id: clientId, orgId }, select: { id: true, name: true, company: true } }),
  ]);
  const totals = new Map<string, { done: number; all: number }>();
  for (const g of taskGroups) {
    if (!g.projectId) continue;
    const t = totals.get(g.projectId) ?? { done: 0, all: 0 };
    t.all += g._count._all;
    if (g.status === "DONE") t.done += g._count._all;
    totals.set(g.projectId, t);
  }
  return (
    <Panel
      title="Projects"
      flush
      action={
        canWrite && client ? (
          <ModalButton label="New project" icon="plus" variant="secondary" title="New project" description={`Create a project for ${client.name}.`} className="px-3 py-1.5 text-xs">
            <ActionForm action={createProject} submitLabel="Create project" pendingLabel="Creating…">
              <ProjectFields clients={[client]} project={{ clientId: client.id }} lockClient />
            </ActionForm>
          </ModalButton>
        ) : undefined
      }
    >
      {projects.length === 0 ? (
        <div className="p-5">
          <EmptyPanel icon="folder" title="No projects for this client" hint="Start a project and it will be tracked against this client." />
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {projects.map((p) => {
            const t = totals.get(p.id) ?? { done: 0, all: 0 };
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/projects/${p.id}`} className="font-medium hover:text-brand">{p.name}</Link>
                  <div className="text-xs text-muted">
                    {projectTypeLabel(p.projectType)}
                    {p.deadline ? ` · due ${fmtDate(p.deadline)}` : ""}
                    {p.contractValueMinor ? ` · ${inr(p.contractValueMinor)}` : ""}
                  </div>
                </div>
                <div className="w-32 shrink-0">
                  <div className="mb-1 text-[11px] text-muted">{t.done}/{t.all} tasks</div>
                  <ProgressBar value={t.done} max={t.all || 1} tone="success" />
                </div>
                <HealthBadge health={p.health} />
                <StatusBadge status={p.status} />
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

async function ProposalsTab({ orgId, clientId }: { orgId: string; clientId: string }) {
  const proposals = await prisma.proposal.findMany({ where: { orgId, clientId }, orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <Panel title="Proposals" flush action={<ButtonLink href="/proposals" variant="secondary" className="px-3 py-1.5 text-xs">All proposals</ButtonLink>}>
      {proposals.length === 0 ? (
        <div className="p-5">
          <EmptyPanel icon="file" title="No proposals yet" hint="Proposals you send to this client will show up here." />
        </div>
      ) : (
        <Table head={["Proposal", "Status", "Value", "Sent", "Valid until"]}>
          {proposals.map((p) => (
            <tr key={p.id} className="hover:bg-surface-2/40">
              <td className="px-4 py-3"><Link href={`/proposals/${p.id}`} className="font-medium hover:text-brand">{p.title}</Link></td>
              <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
              <td className="px-4 py-3">{inr(p.amountMinor)}</td>
              <td className="px-4 py-3 text-muted">{fmtDate(p.sentAt)}</td>
              <td className="px-4 py-3 text-muted">{fmtDate(p.validUntil)}</td>
            </tr>
          ))}
        </Table>
      )}
    </Panel>
  );
}

async function DocumentsTab({ orgId, clientId }: { orgId: string; clientId: string }) {
  const docs = await prisma.document.findMany({
    where: { orgId, clientId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, title: true, mimeType: true, sizeBytes: true, createdAt: true },
  });
  return (
    <Panel title="Documents" flush action={<ButtonLink href="/documents" variant="secondary" className="px-3 py-1.5 text-xs">Open document hub</ButtonLink>}>
      {docs.length === 0 ? (
        <div className="p-5">
          <EmptyPanel icon="file" title="No documents yet" hint="Files filed against this client in the document hub will appear here." />
        </div>
      ) : (
        <Table head={["Document", "Type", "Size", "Added"]}>
          {docs.map((d) => (
            <tr key={d.id}>
              <td className="px-4 py-3 font-medium">{d.title}</td>
              <td className="px-4 py-3 text-muted">{d.mimeType}</td>
              <td className="px-4 py-3 text-muted">{formatBytes(d.sizeBytes)}</td>
              <td className="px-4 py-3 text-muted">{fmtDate(d.createdAt)}</td>
            </tr>
          ))}
        </Table>
      )}
    </Panel>
  );
}

async function CommsTab({ orgId, clientId }: { orgId: string; clientId: string }) {
  const msgs = await prisma.commsMessage.findMany({ where: { orgId, clientId }, orderBy: { sentAt: "desc" }, take: 50 });
  return (
    <Panel title="Conversation log" flush action={<ButtonLink href="/comms" variant="secondary" className="px-3 py-1.5 text-xs">Open Comms</ButtonLink>}>
      {msgs.length === 0 ? (
        <div className="p-5">
          <EmptyPanel icon="mail" title="Nothing logged yet" hint="Emails, calls and meetings logged in Comms for this client will be listed here." />
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {msgs.map((m) => (
            <li key={m.id} className="px-5 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={m.direction === "IN" ? "brand" : "neutral"}>{m.direction === "IN" ? "Received" : "Sent"}</Badge>
                <span className="text-xs uppercase tracking-wide text-muted">{m.channel}</span>
                <span className="ml-auto text-xs text-muted">{fmtDateTime(m.sentAt)}</span>
              </div>
              <div className="mt-1 text-sm font-medium">{m.subject}</div>
              {m.body ? <p className="mt-0.5 line-clamp-2 text-xs text-muted">{m.body}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

async function PortalTab({ orgId, clientId, portalUrl, canWrite }: { orgId: string; clientId: string; portalUrl: string; canWrite: boolean }) {
  const invites = await prisma.portalInvite.findMany({ where: { orgId, clientId }, orderBy: { createdAt: "desc" }, take: 50 });
  const now = Date.now();
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <Panel title="Portal link">
          <p className="text-sm text-muted">
            Anyone with this link can see this client&apos;s projects, documents and invoices, and nothing else. Share it only with people at the client.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-[var(--radius-control)] border border-border bg-surface-2 px-3 py-2 text-xs">{portalUrl}</code>
            <CopyButton text={portalUrl} />
          </div>
        </Panel>
        {canWrite ? (
          <Panel title="Invite someone to the portal">
            <ActionForm action={createPortalInvite} submitLabel="Create invite" pendingLabel="Creating…" className="gap-3">
              <input type="hidden" name="clientId" value={clientId} />
              <p className="text-xs text-muted">The invite is valid for seven days. You will get a link to send to them.</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Name *">
                  <Input name="name" required maxLength={120} placeholder="Priya Sharma" autoComplete="off" />
                </Field>
                <Field label="Work email *">
                  <Input name="email" type="email" required maxLength={200} placeholder="priya@example.com" autoComplete="off" />
                </Field>
              </div>
            </ActionForm>
          </Panel>
        ) : null}
      </div>
      <Panel title="Who has access" flush>
        {invites.length === 0 ? (
          <div className="p-5">
            <EmptyPanel icon="mail" title="Nobody invited yet" hint="Invite a contact and they will be able to follow this client's work." />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {invites.map((inv) => {
              const expired = !inv.acceptedAt && inv.expiresAt.getTime() < now;
              return (
                <li key={inv.id} className="flex items-center gap-3 px-5 py-3">
                  <Avatar name={inv.name} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{inv.name}</div>
                    <div className="truncate text-xs text-muted">{inv.email}</div>
                  </div>
                  {inv.acceptedAt ? (
                    <Badge tone="success">Accepted</Badge>
                  ) : expired ? (
                    <Badge tone="danger">Expired</Badge>
                  ) : (
                    <Badge tone="warn">Pending · expires {fmtDate(inv.expiresAt)}</Badge>
                  )}
                  {canWrite ? (
                    <ActionButton action={revokePortalInvite} fields={{ id: inv.id }} label="Revoke invite" icon="trash" onlyIcon confirm={`Revoke the invite for ${inv.name}?`} />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}

async function ActivityTab({ orgId, clientId, canComment }: { orgId: string; clientId: string; canComment: boolean }) {
  const [logs, comments, members] = await Promise.all([
    prisma.auditLog.findMany({ where: { orgId, entity: "Client", entityId: clientId }, orderBy: { createdAt: "desc" }, take: 40 }),
    prisma.comment.findMany({ where: { orgId, clientId }, orderBy: { createdAt: "desc" }, take: 40 }),
    orgMembers(orgId),
  ]);
  const nameOf = (uid: string | null) => members.find((m) => m.id === uid)?.name ?? members.find((m) => m.id === uid)?.email ?? "Someone";

  type Entry = { key: string; at: Date; kind: "comment" | "audit"; who: string; text: string };
  const entries: Entry[] = [
    ...comments.map((c) => ({ key: `c${c.id}`, at: c.createdAt, kind: "comment" as const, who: nameOf(c.authorId), text: c.body })),
    ...logs.map((l) => ({
      key: `a${l.id}`,
      at: l.createdAt,
      kind: "audit" as const,
      who: l.actorId ? nameOf(l.actorId) : "System",
      text: l.action.replace(/^client\./, "").replace(/[._]/g, " "),
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Panel title="Timeline" flush>
          {entries.length === 0 ? (
            <div className="p-5">
              <EmptyPanel icon="clock" title="No activity yet" hint="Changes to this client and team comments will appear here." />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {entries.map((e) => (
                <li key={e.key} className="flex gap-3 px-5 py-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted">
                    <Icon name={e.kind === "comment" ? "mail" : "clock"} className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">
                      <span className="font-medium">{e.who}</span>{" "}
                      {e.kind === "comment" ? <span className="text-muted">commented</span> : <span className="text-muted">{e.text}</span>}
                    </div>
                    {e.kind === "comment" ? <p className="mt-1 whitespace-pre-line rounded-[var(--radius-control)] bg-surface-2/60 px-3 py-2 text-sm">{e.text}</p> : null}
                    <div className="mt-0.5 text-[11px] text-muted">{fmtDateTime(e.at)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      {canComment ? (
        <Panel title="Add a comment">
          <ActionForm action={addClientComment} submitLabel="Post comment" pendingLabel="Posting…">
            <input type="hidden" name="clientId" value={clientId} />
            <Field label="Visible to your team only">
              <Textarea name="body" required maxLength={4000} placeholder="Call notes, context, next steps" />
            </Field>
          </ActionForm>
        </Panel>
      ) : null}
    </div>
  );
}
