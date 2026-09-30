# Changelog

All notable changes to this project are documented here.
Format: Keep a Changelog; versioning: SemVer.

## [0.2.0] — 2026-09-30

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
