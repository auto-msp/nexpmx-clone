import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { pageContext } from "@/lib/page";
import { relTime, sp } from "@/lib/format";
import { PageHeader, EmptyPanel, Panel } from "@/components/kit";
import { ActionButton, ActionForm, ModalButton, SearchInput } from "@/components/kit-client";
import { cx } from "@/components/ui";
import { FieldLabel, Input, Select, Textarea } from "@/components/ai/fields";
import { MEMORY_AREAS, areaLabel, areaOf, displayFact, isAreaId } from "@/lib/memory";
import { addMemoryFact, setMemoryFactStatus, updateMemoryFact } from "@/app/actions/memory";

export const metadata: Metadata = { title: "What we know", robots: { index: false } };

function href(cat: string, q: string, archived: boolean) {
  const p = new URLSearchParams();
  if (cat) p.set("cat", cat);
  if (q) p.set("q", q);
  if (archived) p.set("show", "archived");
  const s = p.toString();
  return s ? `/memory/what-we-know?${s}` : "/memory/what-we-know";
}

export default async function WhatWeKnowPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const catParam = sp(params.cat);
  const cat = isAreaId(catParam) ? catParam : "";
  const q = sp(params.q).trim().toLowerCase();
  const archived = sp(params.show) === "archived";
  const { orgId, canWrite } = await pageContext("memory:write");

  const all = await prisma.memoryFact.findMany({
    where: { orgId, status: archived ? "ARCHIVED" : "ACTIVE" },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });
  const archivedCount = archived ? all.length : await prisma.memoryFact.count({ where: { orgId, status: "ARCHIVED" } });

  const shown = all
    .map((f) => ({ f, d: displayFact(f), area: areaOf(f.category) }))
    .filter(({ d, area }) => (!cat || area === cat) && (!q || `${d.title} ${d.value}`.toLowerCase().includes(q)));

  const addForm = (
    <ActionForm action={addMemoryFact} submitLabel="Save note">
      <label className="block">
        <FieldLabel>Area</FieldLabel>
        <Select name="category" defaultValue={cat || "ways"}>
          {MEMORY_AREAS.map((a) => (
            <option key={a.id} value={a.id}>{a.label}</option>
          ))}
        </Select>
      </label>
      <label className="block">
        <FieldLabel hint="A short label">What is it about?</FieldLabel>
        <Input name="factKey" required maxLength={80} placeholder="Payment terms for retainers" />
      </label>
      <label className="block">
        <FieldLabel>What should we remember?</FieldLabel>
        <Textarea name="value" required maxLength={1000} placeholder="Say it the way you would explain it to a new hire." />
      </label>
    </ActionForm>
  );

  const groups = MEMORY_AREAS.map((a) => ({ area: a, items: shown.filter((s) => s.area === a.id) })).filter((g) => g.items.length);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="What we know"
        subtitle="Everything saved to your business memory, grouped by area. The assistant and your daily briefing read from this."
        actions={
          canWrite ? (
            <ModalButton label="Add a note" icon="plus" title="Add a note" description="Save one thing worth remembering." size="md">
              {addForm}
            </ModalButton>
          ) : null
        }
      />

      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Areas">
        {[{ id: "", label: "Everything" }, ...MEMORY_AREAS].map((c) => (
          <Link
            key={c.id || "all"}
            href={href(c.id, q, archived)}
            aria-current={cat === c.id ? "true" : undefined}
            className={cx(
              "rounded-full border px-3 py-1 text-xs font-medium",
              cat === c.id ? "border-brand bg-brand/15 text-brand" : "border-border text-muted hover:text-text",
            )}
          >
            {c.label}
          </Link>
        ))}
      </nav>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <SearchInput param="q" placeholder="Search notes…" className="w-full sm:w-72" />
        <Link href={href(cat, q, !archived)} className="text-xs text-brand hover:underline">
          {archived ? "Back to active notes" : archivedCount ? `Show archived (${archivedCount})` : "Show archived"}
        </Link>
      </div>

      {groups.length === 0 ? (
        <EmptyPanel
          icon="brain"
          title={q || cat ? "Nothing matches" : archived ? "Nothing archived" : "Nothing here yet"}
          hint={q || cat ? "Try a different word or area." : archived ? "Archived notes show up here and can be restored." : "Answer a few questions or import from another assistant, and what you tell us lands here."}
          action={
            !q && !cat && !archived ? (
              <div className="flex gap-3 text-sm">
                <Link href="/memory/questions" className="font-medium text-brand hover:underline">Answer questions</Link>
                <Link href="/memory/import" className="font-medium text-brand hover:underline">Import</Link>
              </div>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-5">
          {groups.map(({ area, items }) => (
            <Panel key={area.id} title={`${area.label} (${items.length})`} flush>
              <ul className="divide-y divide-border">
                {items.map(({ f, d }) => (
                  <li key={f.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                    <div className="min-w-0 flex-1 basis-64">
                      <p className="text-sm font-medium">{d.title}</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{d.value}</p>
                      <p className="mt-1.5 text-[11px] text-muted/80">Updated {relTime(f.updatedAt)}</p>
                    </div>
                    {canWrite ? (
                      <div className="flex items-center gap-1">
                        {!archived ? (
                          <ModalButton label="Edit" icon="edit" variant="ghost" className="px-2.5 py-1.5 text-xs" title={`Edit: ${d.title}`} size="md">
                            <ActionForm action={updateMemoryFact} submitLabel="Save changes">
                              <input type="hidden" name="id" value={f.id} />
                              <label className="block">
                                <FieldLabel>Area</FieldLabel>
                                <Select name="category" defaultValue={area.id}>
                                  {MEMORY_AREAS.map((a) => (
                                    <option key={a.id} value={a.id}>{a.label}</option>
                                  ))}
                                </Select>
                              </label>
                              {d.guided ? (
                                <p className="rounded-[var(--radius-control)] bg-surface-2 px-3 py-2 text-xs text-muted">{d.title}</p>
                              ) : (
                                <label className="block">
                                  <FieldLabel>Title</FieldLabel>
                                  <Input name="title" required maxLength={80} defaultValue={f.factKey} />
                                </label>
                              )}
                              <label className="block">
                                <FieldLabel>{d.guided ? "Your answer" : "Note"}</FieldLabel>
                                <Textarea name="value" required maxLength={1000} defaultValue={d.value} />
                              </label>
                            </ActionForm>
                          </ModalButton>
                        ) : null}
                        <ActionButton
                          action={setMemoryFactStatus}
                          fields={{ id: f.id, status: archived ? "ACTIVE" : "ARCHIVED" }}
                          label={archived ? "Restore" : "Archive"}
                          icon={archived ? "check" : "trash"}
                          variant="ghost"
                        />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Panel>
          ))}
        </div>
      )}
      <p className="mt-6 text-xs text-muted">Showing {shown.length} of {all.length} {archived ? "archived" : "active"} notes{cat ? ` in ${areaLabel(cat)}` : ""}.</p>
    </div>
  );
}
