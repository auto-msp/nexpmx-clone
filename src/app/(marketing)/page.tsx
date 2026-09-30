import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink, Card } from "@/components/ui";
import { PLANS, formatInr } from "@/lib/plans";

export const metadata: Metadata = {
  title: "BizMemory — Business Memory Platform",
  description:
    "Clients, projects, documents, decisions and invoices stay connected — so your team and your AI both work from the same memory.",
};

const PILLARS = [
  {
    id: "01",
    title: "Memory",
    body: "Never lose the context. Clients, projects, files and decisions stay connected instead of scattered across inboxes and spreadsheets.",
  },
  {
    id: "02",
    title: "Intelligence",
    body: "Ask questions of your own business. Search across every client, project, invoice and decision in plain language.",
  },
  {
    id: "03",
    title: "Action",
    body: "Turn answers into motion — tasks, approvals, invoices and client updates that flow from the same record.",
  },
];

const MODULES = [
  { name: "Client CRM", desc: "Every client, contact and conversation in one place." },
  { name: "Projects", desc: "Kanban boards, milestones and live status." },
  { name: "Tasks & Time", desc: "Assign work, log hours, watch progress." },
  { name: "Invoicing", desc: "Raise invoices in seconds and track payment." },
  { name: "Client Portal", desc: "A branded home for every client relationship." },
  { name: "Document Hub", desc: "Proposals, SOPs and deliverables, organized." },
  { name: "Decisions Log", desc: "The why behind every call, timestamped forever." },
  { name: "AI Search", desc: "Ask anything about your business, answered instantly." },
  { name: "Automations", desc: "Let the busywork run itself." },
];

export default function HomePage() {
  const planList = [PLANS.STARTER, PLANS.GROWTH, PLANS.SCALE];
  return (
    <>
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-20 sm:px-6 sm:pt-28">
        <p className="text-sm font-medium uppercase tracking-widest text-brand">
          Business Memory Platform
        </p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Your business remembers more than your software does.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-muted">
          BizMemory keeps clients, projects, documents, decisions and invoices
          connected — so your team and your AI both work from the same memory.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/login">Start free</ButtonLink>
          <ButtonLink href="/pricing" variant="secondary">
            See pricing
          </ButtonLink>
        </div>
      </section>

      <section aria-labelledby="pillars" className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <h2 id="pillars" className="sr-only">Memory, Intelligence, Action</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {PILLARS.map((p) => (
            <Card key={p.id}>
              <span className="text-xs font-semibold text-brand">{p.id}</span>
              <h3 className="mt-2 text-lg font-semibold">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{p.body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="modules" className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <h2 id="modules" className="text-2xl font-semibold tracking-tight">
          One system, nine modules
        </h2>
        <p className="mt-2 max-w-2xl text-muted">
          Everything writes to the same memory — so nothing lives in five apps
          and nobody asks “what’s the latest version?” again.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((m) => (
            <Card key={m.name} className="transition-colors hover:border-brand/50">
              <h3 className="font-medium">{m.name}</h3>
              <p className="mt-1 text-sm text-muted">{m.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="home-pricing" className="border-t border-border bg-surface/40">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 id="home-pricing" className="text-2xl font-semibold tracking-tight">
            Simple, transparent pricing
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {planList.map((p) => (
              <Card key={p.id}>
                <h3 className="font-semibold">{p.name}</h3>
                <p className="mt-1 text-2xl font-semibold">
                  {formatInr(p.pricePerUserMinor)}
                  <span className="text-sm font-normal text-muted"> / user / mo</span>
                </p>
                <p className="mt-2 text-sm text-muted">{p.blurb}</p>
                <Link href="/pricing" className="mt-4 inline-block text-sm text-brand hover:underline">
                  See plan details →
                </Link>
              </Card>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
