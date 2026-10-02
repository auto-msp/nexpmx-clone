import { prisma } from "@/lib/db";
import { inr } from "@/lib/format";

export interface DynItem {
  href: string;
  label: string;
  meta?: string;
}
export interface DynGroup {
  heading: string;
  items: DynItem[];
}
/** Keyed by rail module label ("Clients", "Projects", …). */
export type SubnavData = Record<string, DynGroup[]>;

/**
 * Live lists shown under the static links of the contextual sidebar
 * (e.g. "Needs attention", "Due soon"). Small, cheap, org-scoped queries.
 * Never throws: the shell must render even if a query fails.
 */
export async function getSubnavData(orgId: string, userId: string): Promise<{ data: SubnavData; unread: number }> {
  const soon = new Date(Date.now() + 14 * 86_400_000);
  const now = new Date();
  try {
    const [attn, recentClients, due, active, awaitingProps, recentProps, unpaid, recentDocs, unread] = await Promise.all([
      prisma.client.findMany({
        where: {
          orgId,
          status: "ACTIVE",
          OR: [{ health: { in: ["WATCH", "AT_RISK"] } }, { nextFollowUpAt: { lt: now } }],
        },
        orderBy: { updatedAt: "desc" },
        take: 4,
        select: { id: true, name: true, health: true },
      }),
      prisma.client.findMany({ where: { orgId }, orderBy: { createdAt: "desc" }, take: 4, select: { id: true, name: true } }),
      prisma.project.findMany({
        where: { orgId, status: { not: "COMPLETED" }, deadline: { not: null, lt: soon } },
        orderBy: { deadline: "asc" },
        take: 4,
        select: { id: true, name: true, deadline: true },
      }),
      prisma.project.findMany({ where: { orgId, status: "ACTIVE" }, orderBy: { updatedAt: "desc" }, take: 4, select: { id: true, name: true } }),
      prisma.proposal.findMany({
        where: { orgId, status: { in: ["SENT", "VIEWED"] } },
        orderBy: { sentAt: "desc" },
        take: 4,
        select: { id: true, title: true },
      }),
      prisma.proposal.findMany({ where: { orgId }, orderBy: { createdAt: "desc" }, take: 4, select: { id: true, title: true } }),
      prisma.invoice.findMany({
        where: { orgId, status: { in: ["SENT", "OVERDUE"] } },
        orderBy: { dueAt: "asc" },
        take: 4,
        select: { id: true, number: true, amountMinor: true, client: { select: { name: true } } },
      }),
      prisma.document.findMany({ where: { orgId }, orderBy: { createdAt: "desc" }, take: 4, select: { id: true, title: true } }),
      prisma.notification.count({ where: { userId, orgId, readAt: null } }),
    ]);

    const g = (heading: string, items: DynItem[]): DynGroup[] => (items.length ? [{ heading, items }] : []);
    const dueItems = due.map((p) => ({
      href: `/projects/${p.id}`,
      label: p.name,
      meta: p.deadline ? p.deadline.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : undefined,
    }));
    const owedItems = unpaid.map((i) => ({ href: `/invoices/${i.id}`, label: `${i.number} · ${i.client.name}`, meta: inr(i.amountMinor) }));

    return {
      unread,
      data: {
        Clients: [
          ...g("Needs attention", attn.map((c) => ({ href: `/clients/${c.id}`, label: c.name }))),
          ...g("Recent", recentClients.map((c) => ({ href: `/clients/${c.id}`, label: c.name }))),
        ],
        Projects: [
          ...g("Due soon", dueItems),
          ...g("In progress", active.map((p) => ({ href: `/projects/${p.id}`, label: p.name }))),
        ],
        Proposals: [
          ...g("Awaiting signature", awaitingProps.map((p) => ({ href: `/proposals/${p.id}`, label: p.title }))),
          ...g("Recent", recentProps.map((p) => ({ href: `/proposals/${p.id}`, label: p.title }))),
        ],
        Finance: g("Awaiting payment", owedItems),
        Docs: g("Recent", recentDocs.map((d) => ({ href: `/documents`, label: d.title }))),
        CIO: [
          ...g("Needs attention", attn.map((c) => ({ href: `/clients/${c.id}`, label: c.name }))),
          ...g("Due soon", dueItems),
          ...g("Money owed", owedItems),
        ],
      },
    };
  } catch (err) {
    console.error("[subnav] failed", err);
    return { data: {}, unread: 0 };
  }
}
