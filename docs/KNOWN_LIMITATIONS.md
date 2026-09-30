# KNOWN LIMITATIONS

Honest accounting. Each item: priority, why, dependency, complexity, risk.

| # | Item | Pri | Reason it is missing | Dependency | Complexity | Risk if unfixed |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | File uploads (Document Hub) — schema exists, no upload/download flow | P1 | Needs object storage decision (local disk vs S3-compatible) | storage choice | M | Portal/Deliverables feature is incomplete |
| 2 | Billing/payment integration (plan checkout) — plans & entitlements enforced, but no payment rail | P1 | Requires choosing a processor + KYC | processor account | M | No self-serve revenue; manual plan assignment only |
| 3 | Seat-count enforcement at invite time | P2 | Invitations not implemented yet | — | S | Plan caps partially enforced (clients/credits only) |
| 4 | Rate limiter is in-process (single instance only) | P2 | No Redis in minimal deployment | Redis for multi-node | S→M | Limits bypassed behind >1 instance |
| 5 | AI search uses SQL LIKE, not full-text/vector ranking | P2 | Correctness first; index choice deferred | pg_trgm/pgvector decision | M | Mediocre recall on large datasets |
| 6 | Automations entity exists; no trigger/action runner | P2 | Needs queue + worker process | queue choice | M | Advertised feature is not functional |
| 7 | E2E + integration + security test suites | P2 | Time-boxed to unit + smoke this pass | docker CI | M | Regressions detected later than ideal |
| 8 | Multi-org switching (users in >1 org) | P3 | Single default org auto-created | — | S | Blocking for agencies serving multiple brands |
| 9 | Invitations, team management UI | P2 | — | — | M | Single-user orgs only in practice |
| 10 | GST/UPI specifics on invoices (tax fields, payment links) | P2 | Invoicing is generic; regional fields pending | — | M | Not India-compliant as-is |
| 11 | Audit log retention/partitioning | P3 | Volume currently tiny | — | S | Table growth over years |
| 12 | Visual regression vs target | — | Intentionally out of scope (clean-room, original branding) | — | — | None (by design) |
| 13 | Legal pages are placeholders | P1 | Must be replaced by real counsel-reviewed terms/privacy | lawyer | S | Legal exposure in production |
| 14 | No MFA / device session management UI | P2 | Auth.js primitives exist; UI/policy pending | — | M | Weaker account security than enterprise norm |

## Explicitly not pursued (by design, not omission)

- Pixel-level cloning of the target's visual design, copy, or assets —
  clean-room reconstruction only (see README provenance notice).
- Accessing the target's authenticated product surface to document it.
