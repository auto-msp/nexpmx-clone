/**
 * Minimal allow-list HTML sanitizer for rich text authored in the in-app
 * editor (proposal bodies, notes). Keeps a small set of formatting tags,
 * drops every attribute except a safe http(s)/mailto href on <a>, and removes
 * script/style blocks entirely. Output is safe for dangerouslySetInnerHTML.
 */
const ALLOWED = new Set([
  "p", "br", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li",
  "h1", "h2", "h3", "h4", "blockquote", "a", "hr", "div", "span",
]);

export function sanitizeHtml(input: string | null | undefined): string {
  if (!input) return "";
  let html = String(input).slice(0, 200_000);
  html = html.replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1\s*>/gi, "");
  html = html.replace(/<!--[\s\S]*?-->/g, "");
  return html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (full, tag: string, attrs: string) => {
    const name = tag.toLowerCase();
    if (!ALLOWED.has(name)) return "";
    if (full.startsWith("</")) return `</${name}>`;
    if (name === "a") {
      const m = /href\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs);
      const href = (m?.[2] ?? m?.[3] ?? "").trim();
      if (/^(https?:\/\/|mailto:)/i.test(href)) {
        return `<a href="${href.replace(/"/g, "&quot;")}" target="_blank" rel="noopener noreferrer">`;
      }
      return "<a>";
    }
    return `<${name}>`;
  });
}

/** Plain-text preview of rich text. */
export function stripHtml(input: string | null | undefined): string {
  return String(input ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
