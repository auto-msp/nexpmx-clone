# TESTING

## Current coverage

| Level | Scope | Status |
| --- | --- | --- |
| Unit | `plans` (tiers, caps, formatting), `rbac` (matrix, 403s), `ai` stub (ranking, zero-credit no-match), `tenancy.hashToken` | ✅ 11 tests, `npm test` |
| Build | `tsc --noEmit` + `next build` (type + route integrity) | ✅ verified |
| Smoke | health 200, public pages 200, auth gate 307→login (matches target-observed behavior), portal invalid token, API 401 without key | ✅ verified against local prod build + Postgres |
| Security (planned) | IDOR cross-org attempts, RBAC denials via direct action calls, rate-limit trips | backlog |
| Integration (planned) | invoice state machine, client entitlement cap, credit metering against real Postgres | backlog |
| E2E (planned) | Playwright: login → onboarding → client → project → task → invoice → AI query → portal | backlog |

## Conventions

- Tests live in `tests/`, run with `npm test` (vitest).
- Unit tests are pure (no DB); integration tests will use a disposable
  Postgres (docker) and truncate between cases.
- Every bug fix gets a regression test first.

## Differential testing note

A true target-vs-reconstruction differential was out of scope (clean-room;
authenticated target surface not accessed). Differential work here means:
observed public behaviors (auth-gate redirect shape, route presence, pricing
tier structure) verified against this implementation — recorded in
SITEMAP.md and BUSINESS_RULES.md.
