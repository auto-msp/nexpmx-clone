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

## Application to this repo

- Confidence-A findings → reproduced or structurally mirrored (auth-gate shape, tier structure, module taxonomy).
- Confidence-B findings → modeled as documented features.
- Confidence-C/D areas → defensible defaults, marked in ASSUMPTIONS.md and never attributed to the target.
