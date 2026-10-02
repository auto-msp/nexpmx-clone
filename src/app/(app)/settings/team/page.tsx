import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { pageContext, orgMembers } from "@/lib/page";
import { planOf } from "@/lib/plans";
import { getOrCreateSubscription } from "@/lib/subscription";
import { appUrl } from "@/lib/mail";
import { fmtDate, sp } from "@/lib/format";
import { Avatar, EmptyPanel, FormGrid, KpiGrid, KpiTile, PageHeader, Panel } from "@/components/kit";
import { ActionButton, ActionForm, CopyButton, ModalButton, ParamSelect, SearchInput } from "@/components/kit-client";
import { Icon } from "@/components/kit-icons";
import { Badge, ButtonLink, Field, Input, Select } from "@/components/ui";
import { MemberDetail, ROLE_TONE } from "@/components/settings/member-detail";
import { dismissInviteLinkAction, inviteMemberAction, revokeInvitationAction } from "@/app/actions/team";

export const metadata: Metadata = { title: "Team directory", robots: { index: false } };

export default async function TeamDirectoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const q = sp(raw.q).trim().toLowerCase();
  const roleFilter = sp(raw.role);
  const memberParam = sp(raw.member);
  const tab = sp(raw.tab);

  const { orgId, userId, role, canWrite: canInvite } = await pageContext("org:invite");

  const [members, pending, org, sub] = await Promise.all([
    orgMembers(orgId),
    prisma.invitation.findMany({ where: { orgId, status: "PENDING", expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } }),
    prisma.organization.findUnique({ where: { id: orgId }, select: { plan: true } }),
    getOrCreateSubscription(orgId),
  ]);

  // Member detail view.
  if (memberParam) {
    const member = members.find((m) => m.id === memberParam);
    if (member) {
      return <MemberDetail orgId={orgId} viewerId={userId} viewerRole={role} member={member} tab={tab} />;
    }
  }

  const plan = planOf(org?.plan);
  const seatCap = sub.state === "ACTIVE" && sub.seats !== null ? sub.seats : plan.maxSeats;
  const seatsUsed = members.length + pending.length;
  const seatsLeft = seatCap === null ? null : Math.max(0, seatCap - seatsUsed);

  // One-time invite link set by inviteMemberAction (show-once).
  const rawLink = canInvite ? ((await cookies()).get("bm_invite_link")?.value ?? null) : null;
  const inviteUrl = rawLink ? (rawLink.startsWith("http") ? rawLink : rawLink.startsWith("/") ? `${appUrl()}${rawLink}` : `${appUrl()}/invite/${rawLink}`) : null;

  const visible = members.filter((m) => {
    if (roleFilter && m.role !== roleFilter) return false;
    if (!q) return true;
    return [m.name, m.email, m.designation, m.phone].some((v) => (v ?? "").toLowerCase().includes(q));
  });

  const inviteBtn = canInvite ? (
    seatsLeft === 0 ? (
      <ButtonLink href="/billing" variant="secondary">
        All seats used. Add seats
      </ButtonLink>
    ) : (
      <ModalButton label="Invite member" title="Invite a teammate" icon="plus" description="They get a single-use link that works for 7 days." size="sm">
        <ActionForm action={inviteMemberAction} submitLabel="Send invitation" pendingLabel="Inviting…">
          <FormGrid>
            <Field label="Email *">
              <Input name="email" type="email" required maxLength={200} placeholder="teammate@studio.com" autoComplete="off" />
            </Field>
            <Field label="Role">
              <Select name="role" defaultValue="MEMBER">
                <option value="MEMBER">Member</option>
                <option value="MANAGER">Manager</option>
                {role === "OWNER" ? <option value="ADMIN">Admin</option> : null}
              </Select>
            </Field>
          </FormGrid>
          <p className="text-xs text-muted">
            {seatsLeft === null ? "Your plan has no seat cap." : `${seatsLeft} seat${seatsLeft === 1 ? "" : "s"} left, counting pending invitations.`} The link appears on this page after you send it, so you can share it yourself if email is not set up.
          </p>
        </ActionForm>
      </ModalButton>
    )
  ) : null;

  return (
    <>
      <PageHeader title="Team directory" subtitle="Everyone with access to this workspace, and every invitation still open." actions={inviteBtn} />

      {inviteUrl ? (
        <div className="mb-6 rounded-[var(--radius-card)] border border-brand/50 bg-brand/5 p-4">
          <p className="text-sm font-medium">Invitation ready. Share this link now.</p>
          <p className="mt-1 text-xs text-muted">It works once, for the invited address only, and expires in 7 days. It will not be shown again after you dismiss it.</p>
          <code className="mt-3 block overflow-x-auto rounded-[var(--radius-control)] border border-border bg-surface-2 px-3 py-2 text-xs">{inviteUrl}</code>
          <div className="mt-3 flex flex-wrap gap-2">
            <CopyButton text={inviteUrl} label="Copy link" />
            <ActionButton action={dismissInviteLinkAction} fields={{}} label="Dismiss" variant="ghost" />
          </div>
        </div>
      ) : null}

      <KpiGrid cols={3}>
        <KpiTile label="Members" value={members.length} icon="users" />
        <KpiTile label="Seats" value={`${seatsUsed} / ${seatCap ?? "∞"}`} hint="Includes pending invitations" icon="user" tone={seatsLeft === 0 ? "danger" : "neutral"} />
        <KpiTile label="Pending invitations" value={pending.length} icon="mail" tone={pending.length > 0 ? "warn" : "neutral"} />
      </KpiGrid>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput param="q" placeholder="Search by name, email or phone…" className="min-w-0 flex-1 basis-56" />
        <ParamSelect
          param="role"
          allLabel="All roles"
          options={[
            { value: "OWNER", label: "Owner" },
            { value: "ADMIN", label: "Admin" },
            { value: "MANAGER", label: "Manager" },
            { value: "MEMBER", label: "Member" },
          ]}
        />
      </div>

      {visible.length === 0 ? (
        <EmptyPanel icon="users" title="No members match" hint="Try another name or role." action={<ButtonLink href="/settings/team" variant="secondary">Clear filters</ButtonLink>} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((m) => (
            <Link
              key={m.id}
              href={`/settings/team?member=${m.id}`}
              className="group flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4 transition-colors hover:border-brand"
            >
              <div className="flex items-start gap-3">
                <Avatar name={m.name ?? m.email} size="lg" src={m.image} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium group-hover:text-brand">
                    {m.name ?? m.email}
                    {m.id === userId ? <span className="ml-1.5 text-xs font-normal text-muted">(you)</span> : null}
                  </p>
                  <p className="truncate text-xs text-muted">{m.designation || "No designation"}</p>
                </div>
                <Badge tone={ROLE_TONE[m.role] ?? "neutral"}>{m.role.toLowerCase()}</Badge>
              </div>
              <dl className="space-y-1 text-xs text-muted">
                <div className="flex items-center gap-2">
                  <Icon name="mail" className="h-3.5 w-3.5 shrink-0" />
                  <dd className="truncate">{m.email}</dd>
                </div>
                <div className="flex items-center gap-2">
                  <Icon name="phone" className="h-3.5 w-3.5 shrink-0" />
                  <dd className="truncate">{m.phone || "No phone"}</dd>
                </div>
                <div className="flex items-center gap-2">
                  <Icon name="clock" className="h-3.5 w-3.5 shrink-0" />
                  <dd>{m.weeklyCapacityHours} h / week · joined {fmtDate(m.joinedAt)}</dd>
                </div>
              </dl>
            </Link>
          ))}
        </div>
      )}

      {pending.length > 0 ? (
        <div className="mt-8">
          <Panel title={`Pending invitations (${pending.length})`} flush>
            <ul className="divide-y divide-border">
              {pending.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{i.email}</span>
                    <Badge tone="warn">{i.role.toLowerCase()}</Badge>
                  </span>
                  <span className="flex items-center gap-3 text-xs text-muted">
                    expires {fmtDate(i.expiresAt)}
                    {canInvite ? <ActionButton action={revokeInvitationAction} fields={{ id: i.id }} label="Revoke" confirm={`Revoke the invitation for ${i.email}?`} /> : null}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      ) : null}

      {!canInvite ? <p className="mt-6 text-xs text-muted">Only owners and admins can invite or manage members.</p> : null}
    </>
  );
}
