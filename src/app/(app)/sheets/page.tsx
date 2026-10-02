import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { getOrgContext } from "@/lib/tenancy";
import { prisma } from "@/lib/db";
import { canRead } from "@/lib/rbac";
import { Badge, ButtonLink, Card, EmptyState, Field, Input, SectionTitle } from "@/components/ui";
import { createSheet, deleteSheet } from "@/app/actions/sheets";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui";

export const metadata: Metadata = { title: "Sheets", robots: { index: false } };

export default async function SheetsPage() {
  const session = await auth();
  const ctx = await getOrgContext(session!.user!.id);
  if (!canRead(ctx!.role)) throw new Error("Forbidden");

  const sheets = await prisma.sheet.findMany({
    where: { orgId: ctx!.orgId },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sheets</h1>
          <p className="mt-1 text-sm text-muted">Create and manage your spreadsheets.</p>
        </div>
        <Card className="w-full max-w-md">
          <SectionTitle>New sheet</SectionTitle>
          <form action={createSheet} className="mt-3 flex items-end gap-2">
            <div className="flex-1">
              <Field label="Title *">
                <Input name="title" required maxLength={120} placeholder="Q4 budget tracker" />
              </Field>
            </div>
            <SubmitButton pendingLabel="Creating…">Create</SubmitButton>
          </form>
        </Card>
      </div>

      {sheets.length === 0 ? (
        <EmptyState
          title="No sheets yet"
          hint="Create your first spreadsheet to get started."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sheets.map((s) => (
            <Card key={s.id}>
              <div className="flex items-start justify-between gap-2">
                <Link href={`/sheets/${s.id}`} className="font-medium text-text hover:text-brand">
                  {s.title}
                </Link>
                <Badge tone="neutral">
                  updated {s.updatedAt.toISOString().slice(0, 10)}
                </Badge>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <ButtonLink href={`/sheets/${s.id}`} variant="secondary" className="px-3 py-1.5 text-xs">
                  Open
                </ButtonLink>
                <form action={deleteSheet}>
                  <input type="hidden" name="id" value={s.id} />
                  <Button variant="ghost" type="submit" className="px-2 py-1 text-xs">Delete</Button>
                </form>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
