# BUSINESS RULES

| ID | Rule | Evidence | Implementation | Test |
| --- | --- | --- | --- | --- |
| RULE-AUTH-01 | Unauthenticated users are redirected to /login with callbackUrl | Observed on target (A) | `src/middleware.ts` | smoke test (307 verified) |
| RULE-AUTH-02 | callbackUrl must be same-origin relative | Engineering (open-redirect defense) | `src/app/actions/auth.ts` | code review |
| RULE-ENT-01 | Starter plan caps active clients at 10 | Observed pricing structure (A: structure; cap value B) | `createClient` in `src/app/actions/clients.ts` | manual + planned integration |
| RULE-ENT-02 | AI usage consumes per-plan monthly credits; exhausted ⇒ 402 | Observed credit allowances (A: structure) | `buildContextAndAnswer` | manual |
| RULE-INV-01 | Invoice lifecycle DRAFT→SENT→(PAID\|OVERDUE), OVERDUE→PAID; anything else rejected | Inferred standard practice (C) | `src/lib/invoice-state.ts` + `transitionInvoice` | ✅ unit + integration |
| RULE-INV-02 | Invoice numbers unique per org; money stored in minor units | Inferred (C); accounting hygiene | schema + P2002 handling | planned integration |
| RULE-DATA-01 | Rows never cross organizations | Standard SaaS tenancy (C) | scoped queries + FK re-checks | planned security tests |
| RULE-RBAC-01 | MEMBER cannot write clients/invoices; OWNER only org:manage | Assumed baseline (C) | `src/lib/rbac.ts` | ✅ unit tests |
| RULE-AI-01 | AI answers are grounded in org-scoped context only; questions not logged verbatim | Engineering (privacy-by-design) | `src/app/actions/assistant.ts` | manual |
| RULE-PORTAL-01 | Client portal is read-only and scoped to one client via capability token | Inferred from target marketing (B) | `src/app/portal/[token]/page.tsx` | manual |
| RULE-AUTO-01 | Starter has no automation runs; Growth 500/mo; Scale unlimited | Observed (A: structure) | plan catalog (runner pending) | — |
| RULE-ENT-03 | Uploads respect plan storage caps (10/20/100 GB) and a 25 MB per-file ceiling; mime allowlist enforced server-side | Engineering (plan structure observed) | `checkStorageEntitlement` + `src/lib/documents.ts` + `uploadDocument` | ✅ unit (arithmetic) + e2e |
| RULE-ENT-04 | TRIALING orgs have 14 days; expired trials, PAST_DUE and CANCELED orgs see the plan gate and are refused mutations | Account-holder evidence (A, 2026-09-30) | `requireEntitlement` + (app) layout gate | ✅ unit + integration |
| RULE-ENT-05 | Seats consumed by members + live pending invites; capped at `plan.maxSeats` at invite AND accept time | Observed seat caps pattern (A: structure) | `src/lib/seats.ts` + `inviteMemberAction` + `/invite/[token]` | ✅ integration |
| RULE-DOC-01 | Download links are HMAC-signed, expire in 5 minutes, and are re-verified against session + org scope; portal links additionally bound to the portal token | Engineering (SECURITY.md §Uploads) | `src/lib/documents.ts` + download routes | ✅ unit + e2e (14 checks) |
| RULE-IDEM-01 | Create submissions carry a per-render idempotency key; a retried submission replays the original record instead of duplicating (claim + create in one serializable transaction) | Engineering (resilience audit) | `src/lib/idempotency.ts` + `createClient`/`createInvoice` | ✅ integration (`tests/followups.test.ts`) |

Where evidence is C or lower, the rule is our defensible reconstruction, not a
claim about the target's internals — see ASSUMPTIONS.md.
