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
| `/settings` | Dynamic | Session | Workspace, team, API keys, audit view | Assumed (C) |
| `/documents` | Dynamic | Session | Document Hub: upload/download, storage meter | Inferred (B); UI structure observed (A, 2026-10-02) |
| `/proposals` | Dynamic | Session | Proposal pipeline: Draft→Sent→Viewed→Accepted/Rejected, stage totals, invoice hand-off | Observed (A, screenshots) |
| `/comms` | Dynamic | Session | Client comms log: email/call/meeting/note, direction + channel filters | Observed (A, screenshots) |
| `/memory` | Dynamic | Session | Business memory: facts, categories, add/archive | Observed (A, screenshots) |
| `/memory/what-we-know` | Dynamic | Session | Rolling memory summary grouped by category | Observed (A, screenshots) |
| `/memory/questions` | Dynamic | Session | Memory questions: ask, answer, dismiss | Observed (A, screenshots) |
| `/memory/import` | Dynamic | Session | Paste import (key: value / category\|key: value) | Observed (A, screenshots) |
| `/sheets` | Dynamic | Session | Spreadsheet list + create | Observed (A, screenshots) |
| `/sheets/[sheetId]` | Dynamic | Session | Grid editor A–Z × 1–100, formulas (SUM/AVG/MIN/MAX/COUNT), CSV export | Observed (A, screenshots) |
| `/ai` | Dynamic | Session | AI module hub: team status, credits, cards | Observed (A, screenshots) |
| `/ai/team` | Dynamic | Session | AI team: five virtual employees, enable/disable, rate card | Observed (A, screenshots) |
| `/ai/skills` | Dynamic | Session | Skills library: ready-made (6 categories) + custom | Observed (A, screenshots) |
| `/ai/automations` | Dynamic | Session | Automations: recipe catalog + custom builder + enable/disable | Observed (A, screenshots) |
| `/cio` | Dynamic | Session | CIO executive brief: watchlists + generated summary | Observed (A, screenshots) |
| `/reports` | Dynamic | Session | Revenue, client revenue, team reports | Observed (A, screenshots) |
| `/settings/team` | Dynamic | Session (OWNER/ADMIN to invite) | Team directory: members, seats, invites | Observed (A, screenshots) |
| `/settings/plan` | Dynamic | Session | Plan & usage meters | Observed (A, screenshots) |
| `/settings/company` | Dynamic | Session (OWNER/ADMIN) | Company & GST profile | Observed (A, screenshots) |
| `/settings/notifications` | Dynamic | Session (OWNER/ADMIN) | Org notification preferences + feed | Observed (A, screenshots) |
| `/settings/privacy` | Dynamic | Session | Data inventory & protections | Observed (A, screenshots) |
| `/settings/audit` | Dynamic | Session | Full audit log with pagination + action filter | Engineering addition |
| `/help` | Static | Public | Help center FAQ | Observed (A, screenshots) |
| `/billing` | Dynamic | Session (works while gate active) | Plan chooser + checkout entry; reachable from the expired-trial gate | Engineering addition (ADR-017) |
| `/billing/checkout` | Dynamic | Session (org-scoped order) | Razorpay Checkout host page | Engineering addition (ADR-017) |
| `/invite/[token]` | Dynamic | Invite token | Invitation acceptance (seat-checked) | Engineering addition |
| `/portal/[token]` | Dynamic | Portal token | Read-only client portal + documents | Inferred (B) |
| `/portal/[token]/download/[documentId]` | Handler | Portal token | Signed portal download | Engineering addition |
| `/api/auth/[...nextauth]` | Handler | Public | Auth.js endpoints | Standard |
| `/api/health` | Handler | Public | Liveness + DB readiness | Engineering addition |
| `/api/v1/clients` | Handler | API key | List/create clients | Engineering addition |
| `/api/v1/invoices` | Handler | API key | List invoices | Engineering addition |
| `/api/download/[documentId]` | Handler | Session + signed token | App download (5-min HMAC) | Engineering addition |
| `/api/webhooks/razorpay` | Handler | HMAC signature | Payment webhook: verify → ledger (exactly-once) → activate FSM | Engineering addition (ADR-017) |
| `/robots.txt`, `/sitemap.xml` | Generated | Public | SEO | Engineering addition |

## Auth-gate behavior

Verified locally by smoke test and matching the target's observed behavior:

```
GET /dashboard  → 307 /login?callbackUrl=%2Fdashboard
GET /overview   → 307 /login?callbackUrl=%2Foverview
```

Middleware performs a cookie-presence check only; server routes re-check the
session and org scope (middleware is never the authorization point).
