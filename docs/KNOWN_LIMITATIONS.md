# KNOWN LIMITATIONS

Honest accounting. Each item: priority, why, dependency, complexity, risk.

| # | Item | Pri | Reason it is missing | Dependency | Complexity | Risk if unfixed |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | ~~File uploads (Document Hub)~~ DONE 2026-09-30: local-disk storage adapter (S3 seam), 25 MB/file cap, mime allowlist, plan storage caps, HMAC-signed 5-min download links, portal downloads, audit | ~~P1~~ — | — | — | — | — |
| 2 | Billing/payment integration (plan checkout) — plans & entitlements enforced; TRIALING lifecycle + expiry gate now implemented; no payment rail yet | P1 | Requires choosing a processor + KYC | processor account | M | No self-serve revenue; manual plan assignment only |
| 3 | ~~Seat-count enforcement at invite time~~ DONE 2026-09-30: enforced at invite AND accept time (members + live pending invites vs plan.maxSeats) | ~~P2~~ — | — | — | — | — |
| 4 | Rate limiter is in-process (single instance only) | P2 | No Redis in minimal deployment | Redis for multi-node | S→M | Limits bypassed behind >1 instance |
| 5 | AI search uses SQL LIKE, not full-text/vector ranking | P2 | Correctness first; index choice deferred | pg_trgm/pgvector decision | M | Mediocre recall on large datasets |
| 6 | Automations entity exists; no trigger/action runner | P2 | Needs queue + worker process | queue choice | M | Advertised feature is not functional |
| 7 | ~~E2E + integration + security test suites~~ PARTIAL 2026-09-30: 31 unit + 12 integration (invoice FSM, client cap, seats, storage, subscription) + 14-check download e2e script; Playwright suite still pending | P2 | Time-boxed this pass | docker CI | M | Regressions detected later than ideal |
| 8 | Multi-org switching (users in >1 org) | P3 | Single default org auto-created | — | S | Blocking for agencies serving multiple brands |
| 9 | ~~Invitations, team management UI~~ PARTIAL 2026-09-30: invite/revoke/accept flow with seat caps + one-time link display; no email delivery (link is copied by hand) | P2 | Needs transactional email provider | email service | S→M | Admins must copy-paste links |
| 10 | GST/UPI specifics on invoices (tax fields, payment links) | P2 | Invoicing is generic; regional fields pending | — | M | Not India-compliant as-is |
| 11 | Audit log retention/partitioning | P3 | Volume currently tiny | — | S | Table growth over years |
| 12 | Visual regression vs target | — | Intentionally out of scope (clean-room, original branding) | — | — | None (by design) |
| 13 | Legal pages are placeholders | P1 | Must be replaced by real counsel-reviewed terms/privacy | lawyer | S | Legal exposure in production |
| 14 | No MFA / device session management UI | P2 | Auth.js primitives exist; UI/policy pending | — | M | Weaker account security than enterprise norm |
| 15 | Document download reads whole file into memory (Buffer); streaming + range requests pending | P3 | Files capped at 25 MB so worst case is bounded | — | S | Memory spikes on concurrent large downloads |
| 16 | TRIALING → ACTIVE is a manual DB action until billing lands (see #2); no self-serve checkout, no dunning | P1 | Same as #2 | processor | M | Expired-trial orgs see the plan gate but cannot self-serve |

## Explicitly not pursued (by design, not omission)

- Pixel-level cloning of the target's visual design, copy, or assets —
  clean-room reconstruction only (see README provenance notice).
- Accessing the target's authenticated product surface to document it.
