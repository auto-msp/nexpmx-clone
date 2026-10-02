"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { cx } from "@/components/ui";
import { Icon } from "@/components/kit-icons";
import { GUIDE_ARTICLES, GUIDE_CATEGORIES, type GuideArticle, type GuideCategoryId } from "@/components/home/guide-data";

function matches(a: GuideArticle, terms: string[]): boolean {
  if (terms.length === 0) return true;
  const hay = `${a.title} ${a.summary} ${a.steps.join(" ")} ${a.tip ?? ""}`.toLowerCase();
  return terms.every((t) => hay.includes(t));
}

export function GuideBrowser() {
  const [query, setQuery] = useState("");
  const [openCats, setOpenCats] = useState<Set<GuideCategoryId>>(new Set(["start"]));
  const [openArticle, setOpenArticle] = useState<string | null>(null);

  const terms = useMemo(() => query.toLowerCase().split(/\s+/).filter(Boolean), [query]);
  const searching = terms.length > 0;
  const grouped = useMemo(
    () =>
      GUIDE_CATEGORIES.map((c) => ({ ...c, articles: GUIDE_ARTICLES.filter((a) => a.category === c.id && matches(a, terms)) })).filter((c) => c.articles.length > 0),
    [terms],
  );
  const total = grouped.reduce((n, c) => n + c.articles.length, 0);

  const toggleCat = (id: GuideCategoryId) =>
    setOpenCats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div>
      <div className="relative mb-5">
        <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the help articles…"
          aria-label="Search help articles"
          className="w-full rounded-[var(--radius-control)] border border-border bg-surface-2 py-2.5 pl-9 pr-3 text-sm text-text placeholder:text-muted/60 focus:border-brand focus:outline-none"
        />
      </div>

      {searching ? (
        <p className="mb-3 text-xs text-muted" role="status">
          {total} article{total === 1 ? "" : "s"} match “{query.trim()}”
        </p>
      ) : null}

      {grouped.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-dashed border-border px-6 py-12 text-center">
          <p className="text-sm font-medium">No articles match your search</p>
          <p className="mt-1 text-xs text-muted">Try fewer or different words, or ask the assistant using the sparkle button.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map((c) => {
            const open = searching || openCats.has(c.id);
            return (
              <section key={c.id} className="rounded-[var(--radius-card)] border border-border bg-surface">
                <button
                  type="button"
                  onClick={() => toggleCat(c.id)}
                  aria-expanded={open}
                  disabled={searching}
                  className="flex w-full items-center gap-3 px-5 py-3.5 text-left disabled:cursor-default"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
                    <Icon name={c.icon} className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{c.label}</span>
                    <span className="block truncate text-xs text-muted">{c.blurb}</span>
                  </span>
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted">{c.articles.length}</span>
                  {!searching ? <Icon name={open ? "chevronDown" : "chevronRight"} className="h-4 w-4 text-muted" /> : null}
                </button>
                {open ? (
                  <ul className="divide-y divide-border border-t border-border">
                    {c.articles.map((a) => {
                      const isOpen = openArticle === a.id || (searching && total <= 3);
                      return (
                        <li key={a.id}>
                          <button
                            type="button"
                            onClick={() => setOpenArticle(openArticle === a.id ? null : a.id)}
                            aria-expanded={isOpen}
                            className="flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-surface-2/50"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium">{a.title}</span>
                              <span className="block text-xs text-muted">{a.summary}</span>
                            </span>
                            <Icon name={isOpen ? "chevronDown" : "chevronRight"} className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                          </button>
                          {isOpen ? (
                            <div className="px-5 pb-4">
                              <ol className="space-y-2.5">
                                {a.steps.map((s, i) => (
                                  <li key={i} className="flex gap-3 text-sm">
                                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-2 font-mono text-[10px] text-muted">{i + 1}</span>
                                    <span className="min-w-0 leading-relaxed">{s}</span>
                                  </li>
                                ))}
                              </ol>
                              {a.tip ? (
                                <p className="mt-3 rounded-[var(--radius-control)] border border-brand/30 bg-brand/10 px-3 py-2 text-xs">
                                  <span className="font-semibold text-brand">Tip · </span>
                                  {a.tip}
                                </p>
                              ) : null}
                              {a.link ? (
                                <Link href={a.link.href} className={cx("mt-3 inline-flex items-center gap-1 text-xs text-brand hover:underline")}>
                                  {a.link.label}
                                  <Icon name="chevronRight" className="h-3 w-3" />
                                </Link>
                              ) : null}
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
