import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { getOrgContext } from "@/lib/tenancy";
import { prisma } from "@/lib/db";
import { canRead } from "@/lib/rbac";
import { Badge, Button, Card, SectionTitle } from "@/components/ui";
import { toggleAiEmployee } from "@/app/actions/ai";
import { AI_EMPLOYEES } from "@/lib/ai-team";

export const metadata: Metadata = { title: "AI team", robots: { index: false } };

export default async function AiTeamPage() {
  const session = await auth();
  const ctx = await getOrgContext(session!.user!.id);
  if (!canRead(ctx!.role)) throw new Error("Forbidden");

  const rows = await prisma.aiEmployee.findMany({ where: { orgId: ctx!.orgId } });
  const enabledKeys = new Set(rows.filter((r) => r.enabled).map((r) => r.key));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AI team</h1>
        <p className="mt-1 text-sm text-muted">
          Virtual employees with owned remits. Each one works from the same business memory and
          follows the skills you assign.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {AI_EMPLOYEES.map((e) => {
          const on = enabledKeys.has(e.key);
          return (
            <Card key={e.key}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span aria-hidden className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white ${e.avatarHue}`}>
                    {e.name.charAt(0)}
                  </span>
                  <div>
                    <div className="font-semibold">{e.name}</div>
                    <div className="text-xs text-muted">{e.role}</div>
                  </div>
                </div>
                <Badge tone={on ? "success" : "neutral"}>{on ? "On duty" : "Off duty"}</Badge>
              </div>

              <div className="mt-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted">What I own</div>
                <ul className="mt-1.5 space-y-1 text-sm text-muted">
                  {e.owns.map((o) => (
                    <li key={o}>• {o}</li>
                  ))}
                </ul>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                <span className="text-xs text-muted">
                  {e.creditPrice > 0 ? `${e.creditPrice} AI credits / month` : "Included with the AI module"}
                </span>
                <form action={toggleAiEmployee}>
                  <input type="hidden" name="key" value={e.key} />
                  <Button variant={on ? "secondary" : "primary"} type="submit" className="px-3 py-1.5 text-xs">
                    {on ? "Send off duty" : "Put on duty"}
                  </Button>
                </form>
              </div>
            </Card>
          );
        })}
      </div>

      <Card>
        <SectionTitle>How the team works</SectionTitle>
        <p className="mt-2 text-sm text-muted">
          Employees execute through the modules you already use: Aria turns accepted proposals into
          structured task lists, Vikram drafts invoices and runs the overdue ladder, Maya keeps SOPs
          and resourcing honest, Leo handles client cadence, Sage structures the pipeline. Enable
          the ones you need — the credits meter in the right rail shows the running cost.
        </p>
      </Card>
    </div>
  );
}
