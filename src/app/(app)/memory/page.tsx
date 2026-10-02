import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { pageContext } from "@/lib/page";
import { PageHeader, ProgressBar } from "@/components/kit";
import { Icon } from "@/components/kit-icons";
import { ButtonLink, cx } from "@/components/ui";
import { MEMORY_AREAS, computeMemoryScore, areaLabel, type MemoryScore, type ScorePart } from "@/lib/memory";

export const metadata: Metadata = { title: "Memory", robots: { index: false } };

const DAY = 86_400_000;

function Ring({ value }: { value: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 100 100" className="h-28 w-28 shrink-0 -rotate-90" role="img" aria-label={`Memory score ${value} out of 100`}>
      <circle cx="50" cy="50" r={r} fill="none" strokeWidth="9" className="stroke-surface-2" />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={`${(Math.max(0, Math.min(100, value)) / 100) * c} ${c}`}
        className="stroke-brand"
      />
    </svg>
  );
}

function delta(now: number, then: number, noBaseline: boolean, label: string) {
  if (noBaseline) return `no ${label} to compare yet`;
  const d = now - then;
  if (d === 0) return `no change this ${label}`;
  return `${d > 0 ? "+" : ""}${d} this ${label}`;
}

export default async function MemoryPage() {
  const { orgId } = await pageContext("memory:write");
  const now = Date.now();
  const weekAgo = new Date(now - 7 * DAY);
  const monthAgo = new Date(now - 30 * DAY);

  const [org, facts, answeredQs, openQs, docs, clients] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId }, select: { createdAt: true } }),
    prisma.memoryFact.findMany({ where: { orgId, status: "ACTIVE" }, select: { category: true, factKey: true, createdAt: true } }),
    prisma.memoryQuestion.findMany({ where: { orgId, state: "ANSWERED" }, select: { updatedAt: true } }),
    prisma.memoryQuestion.count({ where: { orgId, state: "OPEN" } }),
    prisma.document.findMany({ where: { orgId }, select: { createdAt: true } }),
    prisma.client.findMany({ where: { orgId, status: "ACTIVE" }, select: { notes: true } }),
  ]);

  const clientsWithNotes = clients.filter((c) => (c.notes ?? "").trim().length > 0).length;
  const scoreAt = (cut: Date | null): MemoryScore => {
    const f = cut ? facts.filter((x) => x.createdAt <= cut) : facts;
    const guided = f.filter((x) => x.factKey.startsWith("q-")).length;
    return computeMemoryScore({
      factCategories: f.map((x) => x.category),
      answered: (cut ? answeredQs.filter((x) => x.updatedAt <= cut) : answeredQs).length + guided,
      documents: (cut ? docs.filter((d) => d.createdAt <= cut) : docs).length,
      clientsTotal: clients.length,
      clientsWithNotes,
    });
  };
  const score = scoreAt(null);
  const wk = scoreAt(weekAgo);
  const mo = scoreAt(monthAgo);
  const orgAge = org ? now - org.createdAt.getTime() : 0;

  // Weakest area: fewest notes, ties broken by the order areas are listed.
  const weakest = [...MEMORY_AREAS].sort((a, b) => score.areaCounts[a.id] - score.areaCounts[b.id])[0];

  const actionFor = (p: ScorePart): { title: string; hint: string; href: string; cta: string; icon: string } => {
    switch (p.id) {
      case "facts":
        return { title: "Import what you already know", hint: "Paste notes from another assistant or upload a document to fill the memory quickly.", href: "/memory/import", cta: "Import", icon: "upload" };
      case "coverage":
        return { title: `Cover ${areaLabel(weakest.id)}`, hint: `Nothing saved yet about ${areaLabel(weakest.id).toLowerCase()}. A few answers will open that area up.`, href: `/memory/questions?area=${weakest.id}`, cta: "Answer five", icon: "help" };
      case "answers":
        return { title: openQs ? `Answer ${openQs} open question${openQs === 1 ? "" : "s"}` : "Answer a few guided questions", hint: "Short answers in your own words work best.", href: "/memory/questions", cta: "Answer questions", icon: "help" };
      case "documents":
        return { title: "Add key documents", hint: "Contracts, SOPs and price lists give the memory real substance.", href: "/documents", cta: "Open documents", icon: "file" };
      default:
        return { title: "Write notes on your clients", hint: `${clients.length - clientsWithNotes} client${clients.length - clientsWithNotes === 1 ? " has" : "s have"} no notes yet.`, href: "/clients", cta: "Open clients", icon: "users" };
    }
  };
  const next = score.parts
    .filter((p) => p.points < p.max && !(p.id === "clients" && clients.length === 0))
    .sort((a, b) => b.max - b.points - (a.max - a.points))
    .slice(0, 3)
    .map((p) => ({ part: p, ...actionFor(p) }));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Business memory"
        subtitle="What this workspace understands about how your business really runs: not just what was recorded, but what has been explained."
      />

      <section className="mb-6 flex flex-wrap items-center gap-6 rounded-[var(--radius-card)] border border-border bg-surface p-6">
        <div className="relative">
          <Ring value={score.total} />
          <span className="absolute inset-0 flex items-center justify-center text-brand">
            <Icon name="brain" className="h-6 w-6" />
          </span>
        </div>
        <div className="min-w-0 flex-1 basis-60">
          <p className="text-4xl font-semibold tracking-tight">
            {score.total} <span className="text-lg font-normal text-muted">/ 100</span>
          </p>
          <p className="mt-1 text-xs text-muted">{delta(score.total, wk.total, orgAge < 7 * DAY, "week")}</p>
          <p className="text-xs text-muted">{delta(score.total, mo.total, orgAge < 30 * DAY, "month")}</p>
          {score.total === 0 ? (
            <p className="mt-3 max-w-lg text-sm text-muted">Nothing yet. Answer a few questions or import what you have already told another assistant, and this starts filling in.</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/memory/questions">Answer questions</ButtonLink>
          <ButtonLink href="/memory/import" variant="secondary">Import</ButtonLink>
        </div>
      </section>

      <section className="mb-6 rounded-[var(--radius-card)] border border-border bg-surface p-5" aria-labelledby="breakdown">
        <h2 id="breakdown" className="mb-4 text-sm font-semibold">How the score adds up</h2>
        <ul className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
          {score.parts.map((p) => (
            <li key={p.id}>
              <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                <span>{p.label}</span>
                <span className="font-mono text-xs text-muted">{p.points} / {p.max}</span>
              </div>
              <ProgressBar value={p.points} max={p.max} tone={p.points >= p.max ? "success" : "brand"} />
              <p className="mt-1 text-xs text-muted">{p.detail}</p>
            </li>
          ))}
        </ul>
      </section>

      <h2 className="mb-3 text-sm font-semibold">By area</h2>
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {MEMORY_AREAS.map((a) => {
          const n = score.areaCounts[a.id];
          return (
            <Link
              key={a.id}
              href={`/memory/what-we-know?cat=${a.id}`}
              className="flex flex-col rounded-[var(--radius-card)] border border-border bg-surface p-4 transition-colors hover:border-brand"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold">{a.label}</span>
                <span className="font-mono text-sm">{n}</span>
              </div>
              <div className="mt-2">
                <ProgressBar value={Math.min(n, 5)} max={5} tone={n >= 5 ? "success" : "brand"} />
              </div>
              <p className="mt-2 flex-1 text-xs text-muted">{a.blurb}</p>
              <p className={cx("mt-2 text-[11px]", n ? "text-success" : "text-muted/80")}>{n ? `${n} saved` : "nothing yet"}</p>
            </Link>
          );
        })}
      </div>

      <section className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-card)] border border-brand/40 bg-brand/10 p-5">
        <p className="text-sm">
          We know least about <strong>{weakest.label.toLowerCase()}</strong>. That is what the next questions are about.
        </p>
        <ButtonLink href={`/memory/questions?area=${weakest.id}`}>Answer five</ButtonLink>
      </section>

      {next.length ? (
        <>
          <h2 className="mb-3 text-sm font-semibold">Next best actions</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {next.map((n) => (
              <div key={n.part.id} className="flex flex-col rounded-[var(--radius-card)] border border-border bg-surface p-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/15 text-brand">
                  <Icon name={n.icon} />
                </span>
                <h3 className="mt-3 text-sm font-semibold">{n.title}</h3>
                <p className="mt-1 flex-1 text-xs text-muted">{n.hint}</p>
                <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Worth up to {n.part.max - n.part.points} points</p>
                <Link href={n.href} className="mt-3 text-sm font-medium text-brand hover:underline">
                  {n.cta} →
                </Link>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
