# Changelog

All notable changes to this project are documented here.
Format: Keep a Changelog; versioning: SemVer.

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
