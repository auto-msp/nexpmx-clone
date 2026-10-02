import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { pageContext } from "@/lib/page";
import { relTime } from "@/lib/format";
import { Badge, Field, Input, Select } from "@/components/ui";
import { EmptyPanel, PageHeader } from "@/components/kit";
import { ActionButton, ActionForm, ModalButton } from "@/components/kit-client";
import { Icon } from "@/components/kit-icons";
import { createBoard, deleteBoard } from "@/app/actions/boards";
import { parseBoardData } from "@/components/projects/board-data";

export const metadata: Metadata = { title: "Boards", robots: { index: false } };

export default async function BoardsPage() {
  const { orgId, canWrite } = await pageContext("project:write");
  const [boards, clients] = await Promise.all([
    prisma.board.findMany({ where: { orgId }, orderBy: { updatedAt: "desc" }, take: 200, include: { client: { select: { id: true, name: true } } } }),
    prisma.client.findMany({ where: { orgId }, orderBy: { name: "asc" }, select: { id: true, name: true }, take: 500 }),
  ]);

  const newBoard = canWrite ? (
    <ModalButton label="New board" icon="plus" title="New board" description="Sketch ideas on a whiteboard or branch them out as a mind map.">
      <ActionForm action={createBoard} submitLabel="Create board" pendingLabel="Creating…">
        <Field label="Board name *">
          <Input name="name" required maxLength={120} placeholder="Onboarding flow" autoComplete="off" />
        </Field>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-xs font-medium text-muted">Type</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="flex cursor-pointer items-start gap-2 rounded-[var(--radius-control)] border border-border bg-surface-2/50 p-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand/10">
              <input type="radio" name="kind" value="WHITEBOARD" defaultChecked className="mt-1 accent-[var(--color-brand)]" />
              <span>
                <span className="font-medium">Whiteboard</span>
                <span className="block text-xs text-muted">Free-form notes, text and shapes.</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 rounded-[var(--radius-control)] border border-border bg-surface-2/50 p-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand/10">
              <input type="radio" name="kind" value="MINDMAP" className="mt-1 accent-[var(--color-brand)]" />
              <span>
                <span className="font-medium">Mind map</span>
                <span className="block text-xs text-muted">Nodes joined by connectors.</span>
              </span>
            </label>
          </div>
        </fieldset>
        <Field label="Client (optional)">
          <Select name="clientId" defaultValue="">
            <option value="">Not linked to a client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
      </ActionForm>
    </ModalButton>
  ) : null;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Boards" subtitle="Whiteboards and mind maps for working through ideas before they become tasks." actions={newBoard} />

      {boards.length === 0 ? (
        <EmptyPanel icon="grid" title="No boards yet" hint="Create a board to map out a plan, a flow or a brainstorm with your team." action={newBoard} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {boards.map((b) => {
            const data = parseBoardData(b.dataJson);
            return (
              <div key={b.id} className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4 transition-colors hover:border-brand">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/boards/${b.id}`} className="min-w-0 flex-1 truncate font-medium hover:text-brand">{b.name}</Link>
                  <Badge tone={b.kind === "MINDMAP" ? "brand" : "neutral"}>{b.kind === "MINDMAP" ? "Mind map" : "Whiteboard"}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <span>{data.items.length} {data.items.length === 1 ? "item" : "items"}</span>
                  {b.kind === "MINDMAP" ? <span>{data.connectors.length} links</span> : null}
                  {b.client ? (
                    <Link href={`/clients/${b.client.id}`} className="inline-flex items-center gap-1 hover:text-brand">
                      <Icon name="building" className="h-3 w-3" />
                      {b.client.name}
                    </Link>
                  ) : null}
                </div>
                <div className="mt-auto flex items-center justify-between border-t border-border pt-3">
                  <span className="text-[11px] text-muted">Updated {relTime(b.updatedAt)}</span>
                  <div className="flex items-center gap-1">
                    <Link
                      href={`/boards/${b.id}`}
                      className="inline-flex items-center gap-1 rounded-[var(--radius-control)] px-2.5 py-1.5 text-xs text-muted hover:bg-surface-2 hover:text-text"
                      aria-label={`Open ${b.name}`}
                    >
                      Open <Icon name="chevronRight" className="h-3.5 w-3.5" />
                    </Link>
                    {canWrite ? (
                      <ActionButton action={deleteBoard} fields={{ id: b.id }} label={`Delete ${b.name}`} icon="trash" onlyIcon confirm={`Delete the board "${b.name}"? This cannot be undone.`} />
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
