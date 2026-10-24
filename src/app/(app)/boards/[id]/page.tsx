import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { pageContext } from "@/lib/page";
import { relTime } from "@/lib/format";
import { Badge, Field, Input, Select } from "@/components/ui";
import { PageHeader } from "@/components/kit";
import { ActionButton, ActionForm, ModalButton } from "@/components/kit-client";
import { deleteBoard, saveBoardData, updateBoard } from "@/app/actions/boards";
import { parseBoardData } from "@/components/projects/board-data";
import { Whiteboard } from "@/components/projects/whiteboard";

export const metadata: Metadata = { title: "Board", robots: { index: false } };

export default async function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { orgId, canWrite } = await pageContext("project:write");
  const board = await prisma.board.findFirst({ where: { id, orgId }, include: { client: { select: { id: true, name: true } } } });
  if (!board) notFound();
  const clients = canWrite ? await prisma.client.findMany({ where: { orgId }, orderBy: { name: "asc" }, select: { id: true, name: true }, take: 500 }) : [];
  const kind = board.kind === "MINDMAP" ? "MINDMAP" : "WHITEBOARD";

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        back={{ href: "/boards", label: "All boards" }}
        title={
          <span className="flex min-w-0 flex-wrap items-center gap-3">
            <span className="truncate">{board.name}</span>
            <Badge tone={kind === "MINDMAP" ? "brand" : "neutral"}>{kind === "MINDMAP" ? "Mind map" : "Whiteboard"}</Badge>
          </span>
        }
        subtitle={
          <span>
            {board.client ? (
              <>
                For <Link href={`/clients/${board.client.id}`} className="text-brand hover:underline">{board.client.name}</Link> ·{" "}
              </>
            ) : null}
            Last saved {relTime(board.updatedAt)}
          </span>
        }
        actions={
          canWrite ? (
            <>
              <ModalButton label="Rename" icon="edit" variant="secondary" title="Board settings" description="Rename the board or link it to a client.">
                <ActionForm action={updateBoard} submitLabel="Save" resetOnSuccess={false}>
                  <input type="hidden" name="id" value={board.id} />
                  <Field label="Board name *">
                    <Input name="name" required maxLength={120} defaultValue={board.name} />
                  </Field>
                  <Field label="Client">
                    <Select name="clientId" defaultValue={board.clientId ?? ""}>
                      <option value="">Not linked to a client</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </Select>
                  </Field>
                </ActionForm>
              </ModalButton>
              <ActionButton
                action={deleteBoard}
                fields={{ id: board.id }}
                label="Delete"
                icon="trash"
                variant="danger"
                confirm={`Delete the board "${board.name}"? This cannot be undone.`}
                className="px-4 py-2 text-sm"
              />
            </>
          ) : null
        }
      />
      <Whiteboard boardId={board.id} kind={kind} initial={parseBoardData(board.dataJson)} canWrite={canWrite} save={saveBoardData} />
    </div>
  );
}
