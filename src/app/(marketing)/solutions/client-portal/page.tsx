import type { Metadata } from "next";
import { ButtonLink, Card } from "@/components/ui";

export const metadata: Metadata = {
  title: "Client Portal",
  description:
    "Give every client one branded home for status, deliverables, approvals and invoices.",
};

const BENEFITS = [
  {
    title: "White-label branding",
    body: "Your logo and colors — clients experience a portal that feels built by you.",
  },
  {
    title: "One-click approvals",
    body: "Clients approve deliverables with a click. Every sign-off is timestamped.",
  },
  {
    title: "Shared files & updates",
    body: "Deliverables and status updates live in one place, always current.",
  },
];

const STEPS = [
  { n: "1", title: "Invite the client", body: "Send a secure portal link. The client sees your brand from day one." },
  { n: "2", title: "Share the work", body: "Publish project status, deliverables and invoices. Clients always see the latest." },
  { n: "3", title: "Collect approvals", body: "Clients review and approve in-portal. You get clean sign-offs and a full history." },
];

export default function ClientPortalPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <p className="text-sm font-medium uppercase tracking-widest text-brand">Client Portal</p>
      <h1 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
        One branded home for every client relationship
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-muted">
        Replace scattered email chains with a single space per client: live
        project status, deliverables, approvals and invoices — in your colors.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <ButtonLink href="/login">Try Client Portal</ButtonLink>
        <ButtonLink href="/pricing" variant="secondary">See pricing</ButtonLink>
      </div>

      <div className="mt-14 grid gap-4 md:grid-cols-3">
        {BENEFITS.map((b) => (
          <Card key={b.title}>
            <h2 className="font-semibold">{b.title}</h2>
            <p className="mt-2 text-sm text-muted">{b.body}</p>
          </Card>
        ))}
      </div>

      <h2 className="mt-16 text-2xl font-semibold tracking-tight">How it works</h2>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {STEPS.map((s) => (
          <Card key={s.n}>
            <span className="text-sm font-semibold text-brand">{s.n}</span>
            <h3 className="mt-2 font-medium">{s.title}</h3>
            <p className="mt-1 text-sm text-muted">{s.body}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
