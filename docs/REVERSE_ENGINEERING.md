# REVERSE-ENGINEERING EVIDENCE REGISTER

## Method

- Public-surface discovery only (read_url / web_search), 2026-09.
- No authenticated browsing; no paywall/auth/protection circumvention; no
  session or credential use; no bulk crawling (single fetches per route).
- Raw observations cached in this document; no target content copied.

## Confidence legend

A = directly observed · B = strongly inferred · C = reasonable assumption · D = unknown

## Register

| # | Finding | Confidence | Source |
| --- | --- | --- | --- |
| 1 | `/overview` requires auth; 302→`/login?callbackUrl=%2Foverview` | A | direct fetch of /overview |
| 2 | Google Authentication used for login | A | user brief + target login flow |
| 3 | Product framing: "Business Memory Platform"; Memory→Intelligence→Action | A | homepage |
| 4 | Modules: Client Portal, AI Studio, GST Invoicing, Projects, Team Ops, Finance, Automations, Document Hub, Tasks & Time, AI Search | A | solutions page "nine other modules" list |
| 5 | Plan structure: Starter/Growth/Scale; per-user monthly; credits 1k/2.5k/10k; seats 10/50/∞; clients 10/∞/∞; storage 10/20/100GB; automation 0/500/∞ | A | pricing page |
| 6 | Target price points ₹650/₹1,300/₹3,800 | A | pricing page (deliberately NOT copied into product) |
| 7 | Account free, workspace opens on plan+payment; no trial | A | pricing FAQ |
| 8 | India-market focus (GST, UPI, ₹) | A | pricing/solutions copy |
| 9 | Framework is Next.js-family (NextAuth callbackUrl convention) | B | redirect signature |
| 10 | Target uses Claude for AI features (their privacy policy) | A (their claim) | search snippet of /privacy |
| 11 | Dashboard/module internals, exact IA of app | D | not accessed (by policy) |
| 12 | Target DB, infra, session details | D | unknowable publicly |
| 13 | robots.txt & sitemap.xml absent on target | A | 404 responses |
| 14 | **14-day free trial exists** per account holder (2026-09-30); contradicts the public pricing FAQ's "no free trial" claim | B (user-provided firsthand) | authorized account holder report |
| 15 | **Authenticated app surface: 71 screenshots** of the operator's own account, supplied by the account holder (2026-10-02). Modules observed: left icon rail (Home, Clients, Projects, Proposals, Finance, Comms, AI, CIO, Memory, Docs, Sheets, Setup); per-module filterable subnav with an "AI in this domain" block; global search (Ctrl+K), bell, avatar; AI credits meter + focus timer in a right rail; footer "…one connected memory for your whole business." | A (authorized firsthand) | account-holder screenshots, /root/Images |
| 16 | Proposals pipeline with Draft/Sent/Viewed/Accepted/Rejected stages and per-stage value totals; accepted proposals convert to invoices | A | screenshots 10:19–10:24 |
| 17 | Reports: Revenue overview, Client profitability, Team performance; Export CSV | A | screenshot 10:19 |
| 18 | Help center with FAQ accordion + contact card | A | screenshot 10:21(1) |
| 19 | Team Directory page: member cards, roles, invite flow | A | screenshot 10:21(1) |
| 20 | CIO page: executive "needs attention" brief with watchlists | A | screenshot 10:24 |
| 21 | AI module: hub; AI team of five role-carded virtual employees (Aria PM, Vikram Finance, Maya Operations, Leo Client Success, Sage Sales) each with an "owns" list and optional credit price; AI Skills Library (ready-made + custom) with category chips and "Taught to <employees>"; Automations library (Money/Delivery/Client care/Team recipes, "event → effects" notation, custom builder with trigger select, action checkboxes, watch scope Everything/One client/One project); Assistant hub (Task Breakdown, Document Generator, AI Chat) | A | screenshots 10:25–10:39 |
| 22 | Business Memory: facts list with category chips (General, Clients, Delivery, Finance, Team, Tools) + add form; "What we know" rolling summary; "Memory questions" log with answered/open states; "Import memory" paste flow; "What we know" modal variant | A | screenshots 10:40–10:41 + Memory-questions/Business-memory captures |
| 23 | Document Hub: client/source cards with file counts, search, ALL/type filter, Upload dialog (file, Category=MISC, client binding, "Make visible to the client" checkbox, general vs client-specific visibility) | A | screenshots 10:42–10:44 |
| 24 | Sheets: workbook list ("All sheets", Recent, empty state) + grid editor A–Z × 1–100 with formula bar (fx), formatting toolbar (bold/align/₹/%/date/decimals), Export CSV, Share | A | screenshots 10:44–10:45 |
| 25 | Settings (Setup module): General/Team/Plan/Billing/Company & GST/Notifications/Data & privacy/Audit structure; invite link shown once; API-key creation; recent audit table | A | Settings screenshots 10:22–10:24, 10:45 |
| 26 | Home/command center: greeting, attention queue, revenue snapshot, AI team on-duty status, quick links | A | screenshot set, Home captures |

## Application to this repo

- Confidence-A findings → reproduced or structurally mirrored (auth-gate shape, tier structure, module taxonomy).
- Confidence-B findings → modeled as documented features.
- Confidence-C/D areas → defensible defaults, marked in ASSUMPTIONS.md and never attributed to the target.
- Findings 15–26 (authorized screenshot evidence) → structural facts mirrored as engineering requirements; **all user-facing copy, branding, instruction texts and recipe descriptions in this repo are original** (clean-room rule, README provenance notice). Names/roles/counts/statuses are treated as uncopyrightable structural facts.
