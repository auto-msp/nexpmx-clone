# KNOWN LIMITATIONS

Honest accounting. Each item: priority, why, dependency, complexity, risk.

| # | Item | Pri | Reason it is missing | Dependency | Complexity | Risk if unfixed |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | ~~File uploads (Document Hub)~~ DONE 2026-09-30: local-disk storage adapter (S3 seam), 25 MB/file cap, mime allowlist, plan storage caps, HMAC-signed 5-min download links, portal downloads, audit | ~~P1~~ — | — | — | — | — |
| 2 | ~~Billing/payment integration (plan checkout)~~ MOSTLY DONE 2026-10-01: Razorpay orders + signed-webhook activation (ADR-017) — TRIALING→ACTIVE/PAST_DUE/CANCELED state machine enforced server-side, idempotent redelivery-safe webhooks, seat-based quoting, self-serve /billing checkout from the expired-trial gate. RESIDUAL: live processor keys (KYC/dashboard setup) + Razorpay Subscriptions product (recurring mandates) not wired; support-activated fallback retained | ~~P1~~ P2 (residual) | Requires Razorpay account + KYC for keys | processor account | S (residual) | Without keys checkout shows contact-us mode — no revenue impact beyond that |
| 3 | ~~Seat-count enforcement at invite time~~ DONE 2026-09-30: enforced at invite AND accept time (members + live pending invites vs plan.maxSeats) | ~~P2~~ — | — | — | — | — |
| 4 | Rate limiter is in-process (single instance only) | P2 | No Redis in minimal deployment | Redis for multi-node | S→M | Limits bypassed behind >1 instance |
| 5 | AI search uses SQL LIKE, not full-text/vector ranking | P2 | Correctness first; index choice deferred | pg_trgm/pgvector decision | M | Mediocre recall on large datasets |
| 6 | Automations entity exists; no trigger/action runner | P2 | Needs queue + worker process | queue choice | M | Advertised feature is not functional |
| 7 | ~~E2E + integration + security test suites~~ LARGELY DONE 2026-10-02: 31 unit + 34 integration/resilience + 14-check download e2e + 17-check billing webhook e2e + Playwright browser suite (18 tests: login gate/session, invoice lifecycle via real UI forms, billing surface + signed-webhook activation + exactly-once redelivery; runs prod build against dev Postgres, session-injection auth, `npm run test:e2e`). RESIDUAL: security-specific Playwright coverage (RBAC denials per role, upload of disallowed types through the real action) | ~~P2~~ P3 (residual) | Security e2e lower priority than unit-level coverage already present | — | S | Regressions in authz UI hidden-state detected later than ideal |
| 8 | Multi-org switching (users in >1 org) | P3 | Single default org auto-created | — | S | Blocking for agencies serving multiple brands |
| 9 | ~~Invitations, team management UI~~ PARTIAL 2026-09-30, unchanged 2026-10-01: invite/revoke/accept flow with seat caps (now sourced from purchased seats when ACTIVE, see #2) + one-time link display; no email delivery (link is copied by hand) | P2 | Needs transactional email provider | email service | S→M | Admins must copy-paste links |
| 10 | GST/UPI specifics on invoices (tax fields, payment links) | P2 | Invoicing is generic; regional fields pending | — | M | Not India-compliant as-is |
| 11 | Audit log retention/partitioning | P3 | Volume currently tiny | — | S | Table growth over years |
| 12 | Visual regression vs target | — | Intentionally out of scope (clean-room, original branding) | — | — | None (by design) |
| 13 | ~~Legal pages are placeholders~~ DRAFTED 2026-10-02: full Terms of Service (14 sections) and Privacy Policy (13 sections) matching actual product behavior (Google SSO, 14-day trial, seat pricing, Razorpay as processor, locally-grounded AI, retention windows) published at /terms and /privacy. RESIDUAL: counsel review before production launch — drafted by engineering, not a lawyer; operator identity/contact address not yet named | ~~P1~~ P1 (residual) | Must be reviewed by qualified counsel; operator legal identity needed | lawyer | S | Legal exposure in production until reviewed |
| 14 | No MFA / device session management UI | P2 | Auth.js primitives exist; UI/policy pending | — | M | Weaker account security than enterprise norm |
| 15 | ~~Document download reads whole file into memory~~ RESOLVED 2026-09-30: downloads stream via `StorageAdapter.getStream` with exact Content-Length. HTTP range requests remain open (P3, moved to backlog sweep; not addressed 2026-10-01) | ~~P3~~ P3 (residual) | — | — | S | Video/large-file seeking in browser previews |
| 16 | ~~TRIALING → ACTIVE is a manual DB action until billing lands~~ RESOLVED 2026-10-01: self-serve checkout activates via signed webhooks (`/billing` reachable from the expired-trial gate); support-activated fallback now an audited OWNER action. Dunning remains a single state (PAST_DUE on payment.failed); no retry ladder yet | ~~P1~~ — | — | — | — | — |

## Explicitly not pursued (by design, not omission)

- Pixel-level cloning of the target's visual design, copy, or assets —
  clean-room reconstruction only (see README provenance notice).
- Accessing the target's authenticated product surface to document it.
