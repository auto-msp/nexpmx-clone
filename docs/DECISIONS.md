# ARCHITECTURE DECISION RECORDS

## ADR-001 — Frontend: Next.js 15 App Router (RSC)

- **Observed requirement:** login-gated app + public marketing site; NextAuth
  callback pattern observed on target (B).
- **Alternatives:** SPA (React+Vite), Remix, SvelteKit.
- **Decision:** Next.js 15 App Router; route groups `(marketing)` / `(app)`.
- **Reason:** server components remove most client data-fetching; server
  actions give a secure-by-default mutation path; one deployable for both zones.

## ADR-002 — Auth: Auth.js v5 + Google OAuth + database sessions

- **Observed:** target uses Google sign-in (A).
- **Alternatives:** JWT sessions, custom OAuth, Clerk/Auth0.
- **Decision:** Auth.js v5, Prisma adapter, DB sessions.
- **Reason:** server-revocable sessions; no vendor lock; JWTs would weaken
  revocation. Vendor auth providers deferred until scale demands them.

## ADR-003 — Database: PostgreSQL via Prisma

- **Observed:** relational domain (org→clients→projects→invoices), uniqueness
  needs (invoice numbers), transactional mutations.
- **Alternatives:** MySQL, MongoDB, SQLite.
- **Decision:** PostgreSQL + Prisma; org-column tenancy.
- **Reason:** transactional integrity, rich indexing, future pgvector/pg_trgm
  for AI search upgrades. Prisma gives typed, parameterized queries (SQLi-safe).

## ADR-004 — Mutations: Server Actions over REST-for-everything

- **Alternatives:** full REST API consumed by client JS.
- **Decision:** Server Actions for the browser app; REST v1 only for machines.
- **Reason:** less client JS, no hand-rolled fetch/error plumbing; explicit
  REST surface kept for integrations. If a mobile client arrives, actions map
  1:1 to REST handlers (same pipeline).

## ADR-005 — AI: provider-agnostic adapter, stub default

- **Observed:** AI is a core marketed feature; target names Claude in policy.
- **Alternatives:** hard-code OpenAI/Anthropic SDK; local LLM.
- **Decision:** `AiProvider` interface; deterministic stub grounded in
  org-scoped context; vendor selection deferred.
- **Reason:** product logic (context assembly, metering, audit) is vendor-
  independent; swapping vendors is a one-function change; dev/test needs no keys.

## ADR-006 — Rate limiting: in-process fixed window

- **Decision:** in-memory limiter per key (AI, API keys, portal IPs).
- **Reason:** zero-dependency for single-VM target deployment (Oracle).
- **Trade-off:** invalid behind multiple instances — upgrade path is Redis
  (KNOWN_LIMITATIONS #4).

## ADR-007 — Single deployable, no microservices

- **Decision:** one Next.js process + one PostgreSQL; systemd + Caddy.
- **Reason:** domain complexity and scale do not justify distribution; split
  worker/queue only when automations land (documented trigger point).

## ADR-008 — Client portal: capability token, not accounts

- **Observed:** target markets friction-free branded portals.
- **Alternatives:** client user accounts.
- **Decision:** 128-bit random URL token, read-only, per-client scope,
  rate-limited, revocable by rotating the token (regenerating it).
- **Reason:** matches UX promise; blast radius limited to one client's records.

## ADR-009 — Money as integer minor units

- **Decision:** `amountMinor` BigInt-safe ints (paise).
- **Reason:** floats corrupt accounting; formatting happens at the edge.
