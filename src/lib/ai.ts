/**
 * AI assistant adapter (docs/BACKEND.md §AI).
 *
 * PROVENANCE: the target advertises "AI Search" / "AI Studio" that answer
 * questions from the business memory. The underlying provider is UNOBSERVED
 * (their privacy policy mentions Claude; we stay provider-agnostic with an
 * adapter so the vendor can be swapped — docs/ASSUMPTIONS.md).
 *
 * The default "stub" provider answers only from locally indexed context —
 * useful in dev/tests and when no API key is configured. Adding a real LLM
 * means implementing `AiProvider` with your vendor SDK; nothing else changes.
 */

export interface AiContextChunk {
  kind: "client" | "project" | "invoice" | "decision" | "document" | "task";
  title: string;
  snippet: string;
}

export interface AiAnswer {
  answer: string;
  sources: AiContextChunk[];
  creditsUsed: number;
}

export interface AiProvider {
  answer(question: string, context: AiContextChunk[]): Promise<AiAnswer>;
}

// ── Stub provider: deterministic, local-only ────────────────────────────────

function scoreChunk(chunk: AiContextChunk, terms: string[]): number {
  const hay = `${chunk.title} ${chunk.snippet}`.toLowerCase();
  return terms.reduce((acc, t) => (hay.includes(t) ? acc + 1 : acc), 0);
}

export const stubProvider: AiProvider = {
  async answer(question, context) {
    const terms = question
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2);

    const ranked = context
      .map((c) => ({ c, s: scoreChunk(c, terms) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 5);

    if (ranked.length === 0) {
      return {
        answer:
          "I could not find anything in your business memory matching that question. Try asking about a client, project, invoice, or decision by name.",
        sources: [],
        creditsUsed: 0,
      };
    }

    const lines = ranked.map(
      ({ c }) => `• [${c.kind}] ${c.title} — ${c.snippet}`,
    );
    return {
      answer:
        `Here is what your business memory contains for “${question}”:\n` +
        lines.join("\n"),
      sources: ranked.map(({ c }) => c),
      creditsUsed: 1,
    };
  },
};

export function getAiProvider(): AiProvider {
  // Future: switch on process.env.AI_PROVIDER ("openai", "anthropic", ...).
  return stubProvider;
}
