import type { Metadata } from "next";
import { pageContext } from "@/lib/page";
import { ButtonLink } from "@/components/ui";
import { PageHeader, Panel } from "@/components/kit";
import { GuideBrowser } from "@/components/home/guide-browser";
import { GUIDE_ARTICLES, KEYBOARD_SHORTCUTS } from "@/components/home/guide-data";

export const metadata: Metadata = { title: "Help", robots: { index: false } };

export default async function GuidePage() {
  await pageContext();
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Help"
        subtitle={`${GUIDE_ARTICLES.length} short how-to guides for everything in the workspace. Search, or browse by area.`}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <GuideBrowser />

        <aside className="space-y-5">
          <Panel title="Contact support">
            <p className="text-sm text-muted">Can&apos;t find what you need? Pick whichever is quickest.</p>
            <div className="mt-4 flex flex-col gap-2">
              <ButtonLink href="/assistant?q=How%20do%20I%20" variant="primary">
                Ask the AI assistant
              </ButtonLink>
              <ButtonLink href="/settings/team" variant="secondary">
                Message your workspace owner
              </ButtonLink>
              <ButtonLink href="/help" variant="ghost">
                Read the public FAQ
              </ButtonLink>
            </div>
            <p className="mt-4 text-xs text-muted">
              Bugs and billing questions: include the page address and what you expected to happen. Contact details for the service itself are on the{" "}
              <a href="/terms" className="text-brand hover:underline">
                terms page
              </a>
              .
            </p>
          </Panel>

          <Panel title="Keyboard shortcuts">
            <ul className="space-y-2.5">
              {KEYBOARD_SHORTCUTS.map((s) => (
                <li key={s.action} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted">{s.action}</span>
                  <span className="flex shrink-0 gap-1">
                    {s.keys.map((k) => (
                      <kbd key={k} className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px]">
                        {k}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
