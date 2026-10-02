# TESTING

## Current coverage

| Level | Scope | Status |
| --- | --- | --- |
| Unit | `plans`, `rbac`, `ai` stub, `tenancy.hashToken`, `documents` (allowlist, sanitization, signed tokens), `invoice-state` (lifecycle table), `subscription` (trial state machine), `idempotency` (replay/claim), `env` (fail-fast validation) | ✅ 31 tests, `npm test` |
| Integration | real Postgres (`bizmemory-pg`): invoice state machine + P2002 + cross-org isolation, client entitlement cap, seat accounting (members + live invites), storage entitlement, subscription lifecycle (create/idempotent/expiry/activation), idempotent creates (replay + per-scope keys), billing FSM + activation + PAST_DUE recovery + cancel/reactivate + webhook ledger idempotency + payload mapping + seat quoting | ✅ 34 tests, `npx vitest run` |
| Resilience | storage delete error surfacing (F2), compensating cleanup (F1), atomic credit metering (F3), serializable seat cap (F4), stream round-trip, env validator | ✅ 6 tests + 10 follow-up tests |
| E2E (script) | signed download path over live HTTP: 200 + exact bytes, tampered/expired/portal/wrong-org tokens → 403, missing file → 404, audit written | ✅ 14 checks, `npx tsx scripts/e2e-documents.mts` (server running) |
| E2E (script) | billing webhook over live HTTP: unsigned → 400, signed activation TRIALING→ACTIVE (plan/seats/period/audit/checkout), redelivery exactly-once, unmapped event stored-not-applied, signed garbage → 400 | ✅ 17 checks, `RAZORPAY_WEBHOOK_SECRET=… npx tsx scripts/e2e-billing.mts` (server running with the same secret) |
| Restore drill | dump → pg_restore into scratch DB → row counts + marker fidelity → documents tarball round-trip → cleanup (validated `runbooks/data-recovery.md`) | ✅ executed 2026-09-30 |
| Build | `tsc --noEmit` + `next build` (type + route integrity) | ✅ verified (26 routes) |
| Smoke | health 200, public pages 200, auth gate 307→login, `/documents` gate, invite page states, API 401 without key, download 403 without token | ✅ verified against local prod build + Postgres |
| E2E (Playwright) | Browser suite over the production build against the dev Postgres (`npm run test:e2e`, 18 tests): middleware gate (anonymous → /login?callbackUrl), session-cookie injection (DB sessions; no Google dependency), sign-out re-gating, public pages; invoice lifecycle through real form controls (create → DRAFT → SENT → PAID, duplicate-number P2002 rejection, cross-org invisibility, issuedAt stamping); billing surface (plan chooser + seat picker + contact-us mode without keys), expired-trial gate links, MEMBER cannot manage billing, signed-webhook activation over live HTTP reopening the workspace, exactly-once redelivery, unsigned-webhook 400 | ✅ 18 tests, `npm run test:e2e` |
| Security (planned) | RBAC denials via direct action calls, rate-limit trips, upload of disallowed types through the real action | backlog |

## Conventions

- Tests live in `tests/`, run with `npm test` (vitest).
- Unit tests are pure (no DB). Integration tests (`tests/integration.test.ts`)
  run against the disposable dev Postgres, create org-scoped fixtures with
  random slugs, and tear down in `afterAll` — safe to run repeatedly.
- `tests/integration.test.ts` needs `DATABASE_URL` (loaded from `.env` by
  `vitest.config.ts`; CI injects it as env).
- The e2e script needs the production server running (`npm run start`) — it
  exercises real HTTP, real cookies, and real audit writes.
- Every bug fix gets a regression test first.

## Differential testing note

A true target-vs-reconstruction differential was out of scope (clean-room;
authenticated target surface not accessed). Differential work here means:
observed public behaviors (auth-gate redirect shape, route presence, pricing
tier structure) verified against this implementation — recorded in
SITEMAP.md and BUSINESS_RULES.md.
