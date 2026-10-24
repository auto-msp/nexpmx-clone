# Changelog

All notable changes to this project are documented here.
Format: Keep a Changelog; versioning: SemVer.

## [0.5.0] — 2026-10-02

### Added
- **App surface rebuilt from authorized screenshot evidence (71 captures,
  2026-10-02)** — see REVERSE_ENGINEERING.md findings 15–26. Structural
  facts mirrored; all copy/branding remains original (clean-room).
- **App shell**: left icon rail (Home, Clients, Projects, Proposals,
  Finance, Comms, AI, CIO, Memory, Docs, Sheets, Setup), per-module
  filterable subnav with "AI in this domain" quick actions, AI credits
  meter, focus timer, and a Ctrl+K command palette.
- **Proposals** (`/proposals`): Draft→Sent→Viewed→Accepted/Rejected
  pipeline with per-stage value totals, one-click invoice conversion, and
  `proposal.signed` automation events. Idempotent create, audited
  transitions.
- **Comms** (`/comms`): client communication log (email/call/meeting/note,
  in/out) with filters and an interaction composer.
- **Business Memory** (`/memory`, `/memory/what-we-know`,
  `/memory/questions`, `/memory/import`): category-chipped facts with
  upsert-on-add, rolling "what we know" summary, open/answered question
  log, and a paste importer (`key: value`, `category|key: value`) with
  idempotent bulk upserts and per-line skip reporting.
- **Sheets** (`/sheets`, `/sheets/[id]`): A–Z × 1–100 grid editor with
  formula bar (=SUM/AVG/MIN/MAX/COUNT, refs, arithmetic, loop detection),
  formatting toolbar (bold/italic/underline, alignment, ₹/%/#/date,
  decimals), CSV export, rename; server-side cell validation (256 KB cap,
  key sanitisation).
- **AI module** (`/ai`, `/ai/team`, `/ai/skills`, `/ai/automations`): hub
  with on-duty status; five role-carded virtual employees (Aria, Vikram,
  Maya, Leo, Sage) with enable/disable and credit rate cards (credits
  guarded); skills library — 28 ready-made skills across 6 categories with
  previewable original instructions + custom skills stored as memory;
  automations — 27 ready-to-use recipes (Money/Delivery/Client care/Team)
  + custom builder (trigger, action checkboxes, task title, watch scope
  ALL/CLIENT/PROJECT) with enable/disable/remove.
- **Automation runner**: pure matcher (unit-tested) + `emitAutomationEvent`
  dispatcher wired into invoice.paid, proposal.signed, project.created,
  task.completed; effects: founder notifications (OWNER/ADMIN), client
  notifications (in-app, comms-logged fallback), follow-up task creation.
- **CIO** (`/cio`): executive brief — overdue receivables, pipeline
  awaiting decision, stalled/empty projects, unassigned tasks, open
  questions, memory-grounded summary.
- **Reports** (`/reports`): collected YTD/month/all-time, outstanding,
  overdue, per-client revenue, decisions-by-member.
- **Home command center revamp** (`/dashboard`): greeting, attention
  queue, revenue snapshot, AI team status, quick links.
- **Settings expansion**: `/settings/team` (team directory, seat meter,
  invite flow), `/settings/plan` (usage meters), `/settings/company`
  (Company & GST profile, format-checked GSTIN), `/settings/notifications`
  (org toggles + feed), `/settings/privacy` (data inventory),
  `/settings/audit` (paginated audit log with action filter); settings hub
  now links all sub-pages.
- **Help center** (`/help`): public FAQ.
- **Prisma**: Proposal, CommsMessage, MemoryFact, MemoryQuestion, Sheet,
  AiEmployee models; Automation extended (effects booleans, task title,
  watch scope/targets, lastFiredAt); Organization gains GST/address and
  notification-preference fields.
- **Tests**: `tests/modules.test.ts` — 47 unit tests over the new pure
  helpers (memory parser, sheet engine/CSV, automation matcher, AI team
  pricing, skills catalog, server-side cell validation). Suite total 128
  passing.
- **Transactional email (KNOWN_LIMITATIONS #9)**: provider-agnostic mail
  layer (`src/lib/mail.ts`) — Resend REST integration via plain `fetch`
  (no SDK), 10s timeout, null provider when `RESEND_API_KEY` is absent so
  the app never blocks on email. Branded HTML/text templates with escaped
  interpolation for team invites and automation notifications; invite flow
  now sends the link best-effort and audits `member.invite_emailed` /
  `member.invite_email_failed`; automation dispatch emails founders
  (per-org preference gates) with client-email fallback. `appUrl()` builds
  absolute links from `AUTH_URL`/`APP_URL`.
- **GST on invoices (KNOWN_LIMITATIONS #10)**: `Invoice.gstRateBps`
  (validated ∈ {0, 5, 12, 18, 28%}), `placeOfSupply`, `gstinSnapshot`
  stamped at creation. Tax split computed in `src/lib/gst.ts` (amounts
  stored NET in paise; intra-state → CGST+SGST at half rate each,
  inter-state → IGST; half-up rounding per component). Invoices page shows
  Net/GST/Gross columns with rate + place-of-supply composer fields;
  client-portal invoices show the per-component breakdown and a "Pay via
  UPI" deep link (`upi://pay?…`) built from the org's UPI VPA + payee name
  (new Org fields, format-checked VPA in `/settings/company`).
- **E2E coverage extended (KNOWN_LIMITATIONS #7)**: Playwright suite 18 →
  26 tests — new modules spec over the v0.5.0 surface: proposals lifecycle
  end-to-end (create → send → accept → invoice conversion with DB-verified
  write), business memory (add/import/ask+answer), sheets (formula bar
  edit, computed value, save + reload persistence), automations (recipe
  install + real dispatch on invoice PAID verifying the notification
  payload), comms log + filters, company GST profile save + malformed
  GSTIN rejection, team directory, CIO brief.
- **Domain setup guide**: `docs/DOMAIN_SETUP.md` — recommended subdomain
  `app.nexpmx.com` (A record → VM, DNS-only during first cert issuance),
  Caddy TLS, Google OAuth redirect + `AUTH_URL`, Resend domain
  verification, Razorpay webhook URL, verification curls, troubleshooting.

### Changed
- RBAC matrix gains `memory:write` and `comms:write` (OWNER/ADMIN/MANAGER
  and MEMBER where appropriate).
- KNOWN_LIMITATIONS #6 (automations) largely done with residuals; #10
  updated (GST profile exists, invoice tax fields still pending); #12
  notes structural-vs-visual parity scope; new 5a/12a residuals recorded.
- CSP: strict `script-src` retained for production; dev adds `'unsafe-eval'`
  because `next dev` evaluates modules through eval() — without it, React
  hydration dies with EvalError in development only.
- Sheets formulas are CSP-safe: arithmetic evaluation uses a small
  recursive-descent parser instead of `new Function()`, which the strict
  Content-Security-Policy forbids in the browser.
- `.env.example` gains `RESEND_API_KEY`, `MAIL_FROM_NAME`,
  `MAIL_FROM_ADDRESS`.
- Tests: `tests/gst-mail.test.ts` — 16 unit tests over GST math (rate
  guard, intra/inter-state split, half-up rounding, paise formatting, UPI
  link shape) and mail (plausible-address guard, template escaping). Suite
  total 144 passing.

## [0.4.0] — 2026-10-02

### Added
- **Playwright browser E2E suite (KNOWN_LIMITATIONS #7)**: 18 tests over the
  production build (`npm run test:e2e`) covering the login gate and session
  lifecycle (middleware redirect shape, DB-session cookie injection,
  sign-out re-gating), the invoice lifecycle driven through real UI form
  controls (create → DRAFT → SENT → PAID, duplicate-number rejection,
  cross-org isolation, issuedAt stamping), and the billing surface
  (contact-us mode without keys, expired-trial gate, MEMBER RBAC on /billing,
  signed-webhook activation reopening the workspace, exactly-once
  redelivery, unsigned-webhook 400). Fixtures seed users/orgs/sessions via
  Prisma and tear down in FK-safe order — repeatable against the shared dev
  Postgres.
- **Legal documents (KNOWN_LIMITATIONS #13 draft)**: full Terms of Service
  (/terms) and Privacy Policy (/privacy) matching actual product behavior —
  Google SSO, 14-day trial with read-only lock, seat-based Razorpay billing,
  locally-grounded AI with no third-party model calls by default, retention
  windows, India governing law, DPDP/GDPR-style rights. **Not yet
  counsel-reviewed** — review still required before production launch.

### Changed
- `npm run test:e2e` / `test:e2e:ui` scripts; `.gitignore` for Playwright
  artifacts; TESTING.md E2E table row; KNOWN_LIMITATIONS #7 → largely done,
  #13 → drafted (residual: counsel review).

## [0.3.0] — 2026-10-01

### Added (billing — KNOWN_LIMITATIONS #2/#16)
- **Payment rail (ADR-017)**: Razorpay chosen over Cashfree via structured
  comparison (UPI coverage, subscription tooling, webhook model, integration
  depth); isolated behind `src/lib/razorpay.ts` so the provider remains
  swappable. Orders-based checkout with a **server-computed quote**
  (`seats × plan price`, paise) — the browser never states an amount.
- **Subscription state machine** (`RULE-SUB-01`): explicit transition table
  (`src/lib/subscription-state.ts`) — TRIALING→ACTIVE, ACTIVE→PAST_DUE/
  CANCELED, PAST_DUE→ACTIVE/CANCELED, CANCELED→ACTIVE on fresh payment;
  never re-trialing. Illegal moves throw; guarded updates use a from-state
  condition so stale reads cannot clobber newer states.
- **Webhook activation** (`RULE-SUB-02/03`): `POST /api/webhooks/razorpay`
  verifies the HMAC-SHA256 signature (constant-time) over the raw body,
  validates the envelope with zod, records each event exactly once in the
  `BillingEvent` ledger ((provider, eventType, externalId) UNIQUE —
  redeliveries replay as "duplicate" with zero side effects), maps events to
  orgs via order notes, and applies TRIALING→ACTIVE / period extension /
  PAST_DUE. Unmappable events are stored (orgId null) for reconciliation,
  never applied. Meaningful changes audited (ids/plan/seats only).
- **Checkout UX**: `/billing` (outside the expired-trial gate — an expired
  org must be able to pay) with the plan chooser and seat picker;
  `/billing/checkout` hosts the Razorpay widget; the widget callback is
  verified (HMAC) but UX-only — activation authority stays with the webhook.
  `TrialGate` now links to `/billing` ("Choose a plan & reactivate").
- **Seat-based pricing** (`RULE-ENT-05` update): when a subscription is
  ACTIVE, the seat cap is the purchased `Subscription.seats`; otherwise the
  plan's static `maxSeats`. Enforced at invite AND accept time as before.
- **Support-activated fallback**: the old manual DB activation is now an
  audited, transition-guarded, OWNER-only server action.
- **Schema**: `Subscription` billing fields (period start/end, seats,
  `razorpaySubscriptionId`, last payment), new `CheckoutSession` (org-scoped,
  unique order id, server quote) and `BillingEvent` (idempotency ledger).
- **Tests**: 22 billing tests (FSM table, entitlement states, activation/
  recovery/reactivation, webhook signature fail-closed, payload mapping,
  ledger idempotency, seat quoting) and a 17-check billing webhook e2e
  script (`scripts/e2e-billing.mts`) over live HTTP: unsigned → 400,
  activation end-to-end, redelivery exactly-once, signed garbage → 400.
  Totals: 81 vitest tests (5 files), 14-check download e2e, 17-check
  billing e2e.
- **Env**: `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` /
  `RAZORPAY_WEBHOOK_SECRET` (`.env.example` updated). Without them the app
  boots and runs with checkout in contact-us mode (no boot failure —
  billing is optional at runtime).

### Changed
- `requireEntitlement` now shares the single entitlement rule with the
  billing core (`isSubscriptionEntitled`) — one definition of "open".
- `TrialGate` copy links to `/billing` instead of "contact us".
- Route count 26 → 30 (billing page + checkout page + webhook + (billing)
  group layout noop).

### Closed
- KNOWN_LIMITATIONS #16 (self-serve activation) — closed; #2 mostly closed
  (residual: live processor keys/KYC, native Razorpay Subscriptions).

## [0.2.0] — 2026-09-30

### Added (late 0.2.0 — resilience pass)
- **Server idempotency keys**: `IdempotencyKey` model + `withIdempotency`
  (claim + create in one serializable transaction, bounded P2034 retry,
  replay on retry). Wired into `createClient` and `createInvoice` with
  per-render form keys — network retries and double-taps can no longer
  duplicate rows.
- **Streaming downloads**: `StorageAdapter.getStream` (Node → Web stream);
  app and portal download routes stream instead of buffering, removing the
  25 MB memory bound (closes KNOWN_LIMITATIONS #15). Exact Content-Length
  via `stat`.
- **Fail-fast env validation**: `src/instrumentation.ts` runs `assertEnvOrFail`
  at boot — missing DATABASE_URL/AUTH_SECRET (and OAuth creds in production),
  or an unwritable DOCUMENT_STORAGE_DIR, stops startup with a consolidated
  error instead of per-request 500s.
- **Restore drill executed** against the dev Postgres (dump → scratch restore
  → row counts + marker fidelity → documents tarball round-trip), validating
  `runbooks/data-recovery.md`.

### Added
- **Document Hub (P1)**: upload/delete via local-disk storage adapter with an
  S3-compatible seam (`src/lib/storage.ts`); random org-scoped storage keys
  (client filenames are metadata, never paths); server-side mime allowlist +
  25 MB/file cap + plan storage caps (Starter 10 GB / Growth 20 GB /
  Scale 100 GB); SHA-256 integrity digests; `/documents` page with usage
  meter; HMAC-signed 5-minute download links verified against session + org +
  signature; portal downloads under `/portal/[token]/download/[documentId]`
  bound to the portal's own client; audit events for upload/download/delete.
- **Subscription lifecycle (P2)**: `Subscription` model (TRIALING / ACTIVE /
  PAST_DUE / CANCELED); 14-day TRIALING bootstrap on first app entry
  (evidence-backed, ASSUMPTIONS.md §8); trial countdown in sidebar + banner;
  expired-trial gate replaces app routes with the plan chooser; mutations and
  uploads gated server-side via `requireEntitlement` (RULE-ENT-04).
- **Team invitations (P2)**: `Invitation` model with single-use SHA-256-hashed
  tokens, 7-day expiry, role assignment; seat cap enforced at invite AND
  accept time (`plan.maxSeats`); `/invite/[token]` accept flow with
  wrong-account and no-seats states; revoke; one-time link display via
  short-lived httpOnly cookie; team roster in Settings.
- **Tests**: 31 unit tests (documents, tokens, invoice FSM extraction,
  subscription state), 12 integration tests against disposable Postgres
  (invoice state machine, duplicate-number rejection, cross-org isolation,
  client cap, seat accounting, storage entitlement, subscription lifecycle),
  and a 14-check download e2e script (`scripts/e2e-documents.mts`).
- **Infra**: systemd `ReadWritePaths` + provisioning for
  `/var/lib/bizmemory/documents`; nightly document backup + restore drill;
  `DOCUMENT_STORAGE_DIR` / `DOCUMENT_TOKEN_SECRET` env plumbing.
- **Runbooks**: seven operational recovery guides under `runbooks/` for
  verified failure modes (app down, database, document storage, deploy
  rollback, OAuth login, data recovery, secret compromise).

### Changed
- Invoice state machine extracted to `src/lib/invoice-state.ts` (shared by
  actions, UI, and tests).
- `next.config.ts`: server action `bodySizeLimit: "30mb"` for uploads.
- Portal page now lists shared documents with signed download links.

### Security
- Download routes enforce audience separation (portal tokens never open app
  downloads), constant-time HMAC comparison, org-scope re-check on every
  request, and no existence leakage (403 vs 404 semantics).
- Uploaded bytes never touch the database; storage keys are validated against
  a strict pattern before any path is constructed.

## [0.1.0] — 2026-09-30

## [0.1.0] — 2026-09-30

### Added
- Marketing site: home, Client Portal solution page, pricing (3 tiers +
  comparison + FAQ), Intelligence index, legal placeholders, 404s.
- Authentication: Google OAuth (Auth.js v5), database sessions, custom
  `/login` honoring `callbackUrl` (open-redirect-safe), middleware gate with
  target-parity redirect behavior.
- App: dashboard (stats, credit meter), clients (create/archive with plan
  entitlement cap), projects + task board, invoices with explicit lifecycle
  state machine, decisions log, settings (workspace, API keys, audit view).
- AI assistant: provider-agnostic adapter, deterministic stub grounded in
  org-scoped context, monthly credit metering + usage events.
- Client portal: read-only, token-authenticated, org-branded header color.
- REST API v1: `/api/v1/clients` (GET/POST), `/api/v1/invoices` (GET),
  API-key auth (SHA-256-hashed keys), per-org rate limiting.
- Security baseline: security headers + CSP, RBAC matrix, tenant-scoped
  queries with FK re-verification, zod validation, audit log, secret redaction.
- Data model: 16-table PostgreSQL schema (Prisma) with tenancy + indexes.
- Tests: 11 unit tests; typecheck; production build; smoke suite.
- Docs: 17 documents under `docs/` (architecture, security, threat model,
  ADRs, runbooks, limitations, assumptions, evidence register).
- Infrastructure: systemd unit, Caddyfile, deploy script with health gate.
