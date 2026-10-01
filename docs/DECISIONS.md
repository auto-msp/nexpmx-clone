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

## ADR-014 — Document storage: local disk with S3-compatible seam

- **Context:** Document Hub (KNOWN_LIMITATIONS #1) needed a storage backend.
- **Alternatives:** S3/R2 direct, database BYTEA, filesystem-per-org.
- **Decision:** local disk under `DOCUMENT_STORAGE_DIR` behind a
  `StorageAdapter` interface; keys are `<orgId>/<2>/<2>/<random-128-bit>`,
  never user-derived; DB stores metadata only.
- **Reason:** zero new dependencies, no egress cost, fits the single-node
  deployment; the adapter isolates an S3 swap to one file. 25 MB/file cap
  keeps worst-case memory bounded until streaming lands.

## ADR-015 — Download links: HMAC capability, not streaming-auth-only

- **Alternatives:** pure session-gated route, presigned S3 URLs, long-lived
  tokens.
- **Decision:** page-rendered HMAC-SHA256 tokens binding documentId + org
  (+ portal token) with a 5-minute TTL, verified constant-time; the route
  still re-checks session and org scope.
- **Reason:** links expire if shared, browsers/curl cannot replay them
  later, and the double check (signature + tenancy) means neither layer is a
  single point of failure. Presigned URLs will replace ours per-backend when
  S3 lands.

## ADR-017 — Billing rail: Razorpay orders + webhook-verified activation

- **Context:** KNOWN_LIMITATIONS #2/#16 — TRIALING→ACTIVE needs a payment
  rail; requirement is India/UPI, seat-based monthly INR pricing, webhook
  notifications, Next.js server integration. Provider choice made via a
  structured comparison (Gravity Index search, 2026-10-01) of the two
  India-first candidates.
- **Candidates considered:**

  | Constraint | Razorpay | Cashfree |
  | --- | --- | --- |
  | UPI + cards + netbanking | ✅ full coverage incl. UPI Autopay | ✅ full coverage |
  | Subscriptions / recurring | ✅ native (Subscriptions, UPI Autopay mandates) | ✅ subscriptions; fewer mandate options historically |
  | Webhook model | at-least-once, HMAC-SHA256 signature header, per-event types | at-least-once, HMAC signature, similar shape |
  | Node/Next integration | mature SDK + well-documented raw-fetch path | SDK; docs thinner for App-Router patterns |
  | Pricing | ~2% MDR standard; platform fees for payouts | competitive ~2%, settled T+0/T+1 options |
  | Docs/community depth | largest among Indian PGs | solid, smaller ecosystem |

  Both satisfy the hard requirements. **Decision: Razorpay** for the
  deeper subscription/UPI-Autopay tooling and the largest integration
  surface; Cashfree remains a viable swap because the integration is
  isolated to `src/lib/razorpay.ts` + one webhook route (adapter seam,
  same as the storage adapter precedent in ADR-014).
- **Decision:**
  - Orders-based checkout (`POST /v1/orders`) with a **server-computed
    quote** (`seats × plan price`, paise); the browser never states an amount.
  - `CheckoutSession` row per order (plan/seats/amount/org); orgId + plan
    + seats stamped into order `notes`.
  - **Webhook is the activation authority**: `payment.captured` /
    `order.paid` / `subscription.charged` / `subscription.activated` →
    `activatePlan` (TRIALING→ACTIVE or period extension).
    `payment.failed` (ACTIVE only) → PAST_DUE.
  - Webhook authenticity = HMAC-SHA256 over the raw body with
    `RAZORPAY_WEBHOOK_SECRET`, constant-time compared; malformed payloads
    (zod) rejected with 400.
  - Idempotency = `BillingEvent (provider, eventType, externalId)` UNIQUE;
    ledger insert and subscription mutation are ordered so redeliveries
    replay as "duplicate" without re-applying.
  - State transitions go through the explicit table in
    `src/lib/subscription-state.ts`; illegal moves throw.
  - `verifyCheckout` (widget callback) verifies Razorpay's
    `order|payment` HMAC but **never** activates — it is UX-only.
  - Support-activated fallback (`activatePlanAction`) kept, audited,
    OWNER-only (the pre-billing manual path, now guarded).
- **Reason:** matches the stateful-domain requirements (authoritative
  server state, idempotent redelivery-safe webhooks, seat-based pricing,
  explicit FSM) with the smallest dependency footprint; no SDK needed for
  the two endpoints used. Env: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
  `RAZORPAY_WEBHOOK_SECRET` (never committed, never logged).
- **Deliberately out of scope this pass:** Razorpay Subscriptions product
  (recurring mandates) — our 30-day periods are webhook-extended from order
  payments; native subscriptions can be layered on without schema change
  (`razorpaySubscriptionId` column already reserved). GST/UPI invoice
  fields stay KNOWN_LIMITATIONS #10.

## ADR-016 — Trial: Subscription row with TRIALING bootstrap

- **Observed:** account holder confirms a 14-day trial at signup
  (ASSUMPTIONS.md §8).
- **Decision:** one `Subscription` row per org, lazily created as TRIALING
  with `trialEndsAt = now + 14d` on first app entry; expiry gates pages
  (layout) and mutations (`requireEntitlement`); manual plan activation until
  billing lands.
- **Reason:** evidence-backed lifecycle without inventing checkout; the
  state machine (TRIALING/ACTIVE/PAST_DUE/CANCELED) is billing-ready.
