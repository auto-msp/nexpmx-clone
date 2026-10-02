import type { Metadata } from "next";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { rateLimit, fail } from "@/lib/api";
import { formatInr } from "@/lib/plans";
import { signDownloadToken } from "@/lib/documents";
import { gstBreakdown, gstRateLabel, formatPaise, upiPaymentLink } from "@/lib/gst";
import { Badge, Card, EmptyState } from "@/components/ui";

export const metadata: Metadata = {
  title: "Client Portal",
  robots: { index: false, follow: false },
};

/**
 * Client portal — authenticated by a 128-bit portal token in the URL.
 * Read-only, org-scoped to the client's own records only.
 * Rate limited per IP (SECURITY.md §API).
 */
export default async function ClientPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  try {
    const hdrs = await headers();
    const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    rateLimit(`portal:${ip}`, 30, 60_000);
  } catch {
    return <PortalError message="Too many requests. Try again in a minute." />;
  }

  if (!/^[a-f0-9]{32}$/.test(token)) {
    return <PortalError message="This portal link is not valid." />;
  }

  const client = await prisma.client.findUnique({
    where: { portalToken: token },
    include: {
      org: { select: { name: true, brandColor: true, state: true, upiId: true, upiPayeeName: true } },
      projects: {
        where: { status: { not: "COMPLETED" } },
        include: { _count: { select: { tasks: true } } },
        orderBy: { updatedAt: "desc" },
        take: 10,
      },
      invoices: { orderBy: { createdAt: "desc" }, take: 10 },
      documents: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });

  if (!client) {
    return <PortalError message="This portal link is not valid." />;
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <div
        aria-hidden
        className="mb-8 h-1.5 w-24 rounded-full"
        style={{ backgroundColor: client.org.brandColor }}
      />
      <p className="text-sm text-muted">{client.org.name}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        {client.name} — your portal
      </h1>
      <p className="mt-2 text-sm text-muted">
        Live status, deliverables and invoices. Questions? Reply to your project
        thread and we’ll pick it up.
      </p>

      <section aria-labelledby="portal-projects" className="mt-10">
        <h2 id="portal-projects" className="text-lg font-semibold">Your projects</h2>
        <div className="mt-4 grid gap-4">
          {client.projects.length === 0 ? (
            <EmptyState title="No active projects right now" />
          ) : (
            client.projects.map((p) => (
              <Card key={p.id}>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-medium">{p.name}</h3>
                  <Badge tone={p.status === "ACTIVE" ? "success" : "warn"}>{p.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {p._count.tasks} tasks in scope · updated{" "}
                  {p.updatedAt.toISOString().slice(0, 10)}
                </p>
              </Card>
            ))
          )}
        </div>
      </section>

      <section aria-labelledby="portal-documents" className="mt-10">
        <h2 id="portal-documents" className="text-lg font-semibold">Your documents</h2>
        <div className="mt-4 grid gap-4">
          {client.documents.length === 0 ? (
            <EmptyState title="No documents shared yet" />
          ) : (
            client.documents.map((d) => (
              <Card key={d.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-medium">{d.title}</h3>
                    <p className="text-xs text-muted">
                      Shared {d.createdAt.toISOString().slice(0, 10)}
                    </p>
                  </div>
                  <a
                    href={`/api/portal/download/${d.id}/${token}?t=${encodeURIComponent(
                      signDownloadToken({
                        documentId: d.id,
                        orgId: client.orgId,
                        portalToken: token,
                        expiresAt: Date.now() + 5 * 60 * 1000,
                      }),
                    )}`}
                    className="rounded-[var(--radius-control)] border border-border px-3 py-1.5 text-sm text-muted hover:border-brand hover:text-text"
                  >
                    Download
                  </a>
                </div>
              </Card>
            ))
          )}
        </div>
      </section>

      <section aria-labelledby="portal-invoices" className="mt-10">
        <h2 id="portal-invoices" className="text-lg font-semibold">Your invoices</h2>
        <div className="mt-4 grid gap-4">
          {client.invoices.length === 0 ? (
            <EmptyState title="No invoices yet" />
          ) : (
            client.invoices.map((inv) => {
              const gst = gstBreakdown(inv.amountMinor, inv.gstRateBps, client.org.state, inv.placeOfSupply);
              const payLink =
                inv.status !== "PAID" && client.org.upiId
                  ? upiPaymentLink({
                      vpa: client.org.upiId,
                      payeeName: client.org.upiPayeeName || client.org.name,
                      amountMinor: gst.grossMinor,
                      note: `Invoice ${inv.number}`,
                    })
                  : null;
              return (
                <Card key={inv.id}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-medium">{inv.number}</h3>
                      <p className="text-xs text-muted">
                        {inv.dueAt ? `Due ${inv.dueAt.toISOString().slice(0, 10)}` : "No due date"}
                        {inv.gstRateBps > 0 ? (
                          <> · Net {formatInr(inv.amountMinor)} + {gstRateLabel(inv.gstRateBps)} {" "}
                            {gst.intraState ? "CGST+SGST" : "IGST"} = {formatPaise(gst.taxMinor)}
                          </>
                        ) : null}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold">{formatPaise(gst.grossMinor)}</span>
                      <Badge
                        tone={
                          inv.status === "PAID"
                            ? "success"
                            : inv.status === "OVERDUE"
                              ? "danger"
                              : "brand"
                        }
                      >
                        {inv.status}
                      </Badge>
                      {payLink ? (
                        <a
                          href={payLink}
                          className="rounded-[var(--radius-control)] bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-strong"
                        >
                          Pay via UPI
                        </a>
                      ) : null}
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </section>
    </main>
  );
}

function PortalError({ message }: { message: string }) {
  return (
    <main className="mx-auto max-w-md px-4 py-24 text-center">
      <h1 className="text-xl font-semibold">Portal unavailable</h1>
      <p className="mt-2 text-sm text-muted">{message}</p>
      <p className="mt-6 text-xs text-muted">
        Ask your account manager for a fresh link if this persists.
      </p>
    </main>
  );
}
