# SITEMAP & ROUTE INVENTORY

## Target evidence (Phase 1 discovery)

Discovery performed against the public surface only (no authenticated
browsing; no circumvention of the login gate).

| Evidence | Route | Confidence |
| --- | --- | --- |
| Homepage, "Business Memory Platform", pillars 01/02/03 | `/` | A |
| Client Portal solution page; "Nine other modules" list | `/solutions/client-portal` | A |
| Pricing page: Starter ₹650 / Growth ₹1,300 / Scale ₹3,800 per user/mo; limits table | `/pricing` | A |
| Editorial index ("Memory → Intelligence → Action") | `/intelligence` | A |
| Legal pages | `/terms`, `/privacy` | A |
| **`/overview` 302-redirects to `/login?callbackUrl=%2Foverview`** | `/overview`, `/login` | A |
| NextAuth `callbackUrl` pattern ⇒ Next.js + NextAuth stack | (inferred) | B |
| robots.txt / sitemap.xml return 404 on target | — | A |
| AI usage of Anthropic Claude stated in target privacy policy | — | A (their claim; our adapter stays provider-agnostic) |

Authenticated product surface (`/overview`, dashboards, portal internals) was
**not** inspected. Its behavior is modeled from marketing descriptions and
standard SaaS architecture — see `ASSUMPTIONS.md`.

## Route inventory (this repository)

| Route | Type | Auth | Purpose | Provenance |
| --- | --- | --- | --- | --- |
| `/` | Static | Public | Homepage (original copy) | Modeled from observed IA |
| `/solutions/client-portal` | Static | Public | Solution page | Modeled |
| `/pricing` | Static | Public | Plans + comparison + FAQ | Modeled (our own prices) |
| `/intelligence` | Static | Public | Editorial index | Modeled |
| `/terms`, `/privacy` | Static | Public | Legal placeholders | Modeled |
| `/login` | Dynamic | Public | Google sign-in, honors `callbackUrl` | Observed pattern (A) |
| `/overview` | Redirect | Any | Alias → `/dashboard` | Observed route (A) |
| `/dashboard` | Dynamic | Session | Stats, credits, recent decisions | Inferred (B) |
| `/clients` | Dynamic | Session | Client CRM + create/archive | Inferred (B) |
| `/projects` | Dynamic | Session | Projects + task board | Inferred (B) |
| `/invoices` | Dynamic | Session | Invoice lifecycle | Inferred (B) |
| `/decisions` | Dynamic | Session | Decision log | Inferred (B) |
| `/assistant` | Dynamic | Session | Grounded AI Q&A + credits | Inferred (B) |
| `/settings` | Dynamic | Session | Workspace, API keys, audit view | Assumed (C) |
| `/portal/[token]` | Dynamic | Portal token | Read-only client portal | Inferred (B) |
| `/api/auth/[...nextauth]` | Handler | Public | Auth.js endpoints | Standard |
| `/api/health` | Handler | Public | Liveness + DB readiness | Engineering addition |
| `/api/v1/clients` | Handler | API key | List/create clients | Engineering addition |
| `/api/v1/invoices` | Handler | API key | List invoices | Engineering addition |
| `/robots.txt`, `/sitemap.xml` | Generated | Public | SEO | Engineering addition |

## Auth-gate behavior

Verified locally by smoke test and matching the target's observed behavior:

```
GET /dashboard  → 307 /login?callbackUrl=%2Fdashboard
GET /overview   → 307 /login?callbackUrl=%2Foverview
```

Middleware performs a cookie-presence check only; server routes re-check the
session and org scope (middleware is never the authorization point).
