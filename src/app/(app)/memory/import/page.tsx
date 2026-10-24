import type { Metadata } from "next";
import { pageContext } from "@/lib/page";
import { PageHeader } from "@/components/kit";
import { ImportFlow } from "@/components/ai/import-flow";
import { importFacts } from "@/app/actions/memory";

export const metadata: Metadata = { title: "Import", robots: { index: false } };

export default async function MemoryImportPage() {
  const { canWrite } = await pageContext("memory:write");
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Import from another assistant"
        subtitle="Bring over what you have already explained elsewhere. You review every item before anything is saved."
      />
      <ImportFlow importAction={importFacts} canWrite={canWrite} />
    </div>
  );
}
