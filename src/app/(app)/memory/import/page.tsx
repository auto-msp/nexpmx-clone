import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { getOrgContext } from "@/lib/tenancy";
import { canRead } from "@/lib/rbac";
import { Card, Field, SectionTitle, Textarea } from "@/components/ui";
import { importMemory } from "@/app/actions/memory";
import { newIdempotencyKey } from "@/lib/idempotency";
import { SubmitButton } from "@/components/submit-button";

export const metadata: Metadata = { title: "Import memory", robots: { index: false } };

export default async function ImportMemoryPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; skipped?: string }>;
}) {
  const { done, skipped } = await searchParams;
  const session = await auth();
  const ctx = await getOrgContext(session!.user!.id);
  if (!canRead(ctx!.role)) throw new Error("Forbidden");

  const ik = newIdempotencyKey();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Import memory</h1>
        <p className="mt-1 text-sm text-muted">
          Paste an existing list of facts and let the parser file them. Existing keys are updated,
          new keys are created.
        </p>
      </div>

      {done !== undefined ? (
        <Card className="border-success/40">
          <p className="text-sm text-success">
            Imported {done} fact{done === "1" ? "" : "s"}
            {skipped ? ` — ${skipped} line${skipped === "1" ? "" : "s"} skipped` : ""}.
          </p>
        </Card>
      ) : null}

      <Card>
        <SectionTitle>Paste your facts</SectionTitle>
        <form action={importMemory} className="mt-4 space-y-4">
          <input type="hidden" name="ik" value={ik} />
          <Field label="Facts (one per line)">
            <Textarea
              name="importText"
              required
              rows={12}
              className="min-h-56 font-mono text-xs"
              placeholder={`payment-terms: Net-30 from invoice date\nclients|acme-billing: Net-15, PO required\ndelivery|deploy-window: Tue/Thu 18:00 IST\nteam-capacity: 6 engineers, 2 designers\ntools|stack: Next.js, Postgres, Vercel`}
            />
          </Field>
          <div className="rounded-[var(--radius-control)] border border-border bg-surface-2/50 p-3 text-xs text-muted">
            <p className="font-medium text-text">Accepted formats</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              <li><code>key: value</code> — general memory</li>
              <li><code>key = value</code> — equals also works</li>
              <li><code>category|key: value</code> — file under a category (clients, delivery, finance, team, tools)</li>
            </ul>
            <p className="mt-2">Lines without a separator are skipped and counted.</p>
          </div>
          <SubmitButton pendingLabel="Importing…">Import facts</SubmitButton>
        </form>
      </Card>
    </div>
  );
}
