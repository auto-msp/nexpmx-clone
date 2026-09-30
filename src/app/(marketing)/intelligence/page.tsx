import type { Metadata } from "next";
import { Card } from "@/components/ui";

export const metadata: Metadata = {
  title: "Intelligence",
  description:
    "Long-form writing on Business Memory: what it is, why business software has been solving the wrong problem, and how context becomes answers.",
};

const ESSAYS = [
  {
    title: "Your Business Already Knows the Answer. Now You Can Ask It.",
    author: "The BizMemory Team",
    readMinutes: 9,
    summary:
      "Why we think business software has been solving the wrong problem — and what changes when context becomes queryable.",
  },
];

export default function IntelligencePage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Intelligence</h1>
      <p className="mt-3 text-lg text-muted">
        What we are building, and why. The arguments underneath the product —
        written by the people making it.
      </p>

      <div className="mt-10 grid gap-4">
        {ESSAYS.map((e) => (
          <Card key={e.title}>
            <h2 className="text-lg font-semibold">{e.title}</h2>
            <p className="mt-1 text-xs uppercase tracking-wider text-muted">
              {e.author} · {e.readMinutes} min read
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted">{e.summary}</p>
          </Card>
        ))}
      </div>

      <div className="mt-12 grid gap-4 sm:grid-cols-3">
        {[
          { t: "Memory", d: "What does the business know?" },
          { t: "Intelligence", d: "What does that mean right now?" },
          { t: "Action", d: "What should happen next?" },
        ].map((s) => (
          <Card key={s.t}>
            <h2 className="font-semibold">{s.t}</h2>
            <p className="mt-1 text-sm text-muted">{s.d}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
