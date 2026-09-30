# ASSUMPTIONS & UNKNOWNS

Format per investigation protocol: **Observed / Likely / Unknown / Decision / Reason.**

## 1. Target framework

- **Observed:** `/overview` redirects to `/login?callbackUrl=%2Foverview`.
- **Likely:** Next.js + NextAuth (the `callbackUrl` parameter is the NextAuth convention).
- **Unknown:** target's exact framework version/rendering mode.
- **Decision:** Next.js 15 App Router + Auth.js v5.
- **Reason:** reproduces the observed behavior natively; team-friendly.

## 2. Authenticated product surface

- **Observed:** nothing (login-gated; not accessed, by policy).
- **Likely:** dashboard, CRM, projects, invoicing, portal, AI Q&A per marketing copy.
- **Decision:** model those modules from the marketing vocabulary (10 modules),
  implement the coherent core (clients/projects/tasks/invoices/decisions/AI/portal).
- **Reason:** marketing descriptions are the legitimate public evidence.

## 3. Data model

- **Observed:** entity nouns from product copy; per-plan credits/limits.
- **Unknown:** target's actual schema.
- **Decision:** clean relational model (PostgreSQL) with org-scoped rows.
- **Reason:** strongly relational domain; tenancy is the security-critical part.

## 4. AI internals

- **Observed:** target privacy policy states use of Anthropic's Claude for
  assistant features (their claim, public).
- **Unknown:** prompt design, retrieval approach, credit accounting details.
- **Decision:** provider-agnostic adapter; deterministic stub over org-scoped
  context; credits metered per successful query.
- **Reason:** swap-in vendor later without touching product code; no claim of
  parity with target AI behavior.

## 5. Pricing

- **Observed:** target price points and tier structure (₹650/₹1,300/₹3,800).
- **Decision:** identical tier *structure* (credits/limits), deliberately
  different prices (₹499/₹999/₹2,999).
- **Reason:** clean-room separation of commercial terms; structure is the
  functional content, prices are their business terms.

## 6. Session semantics

- **Unknown:** target's session lifetime/revocation behavior.
- **Decision:** database sessions, 30-day default, immediate revocation on sign-out.
- **Reason:** server-revocable sessions are the defensible default for org SaaS.

## 7. Portal authentication

- **Observed:** target markets "branded portal, no login friction" style UX.
- **Decision:** 128-bit capability token in URL, read-only, rate-limited.
- **Reason:** matches the marketed simplicity; secure enough given read-only scope.

## Open unknowns (not resolvable without target access — intentionally not pursued)

- Exact authenticated routes/labels of the target app.
- Target's error message copy and exact validation rules.
- Target's automation engine semantics.
- Target's actual invoice numbering/tax handling.
