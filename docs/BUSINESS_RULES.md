# BUSINESS RULES

| ID | Rule | Evidence | Implementation | Test |
| --- | --- | --- | --- | --- |
| RULE-AUTH-01 | Unauthenticated users are redirected to /login with callbackUrl | Observed on target (A) | `src/middleware.ts` | smoke test (307 verified) |
| RULE-AUTH-02 | callbackUrl must be same-origin relative | Engineering (open-redirect defense) | `src/app/actions/auth.ts` | code review |
| RULE-ENT-01 | Starter plan caps active clients at 10 | Observed pricing structure (A: structure; cap value B) | `createClient` in `src/app/actions/clients.ts` | manual + planned integration |
| RULE-ENT-02 | AI usage consumes per-plan monthly credits; exhausted ⇒ 402 | Observed credit allowances (A: structure) | `buildContextAndAnswer` | manual |
| RULE-INV-01 | Invoice lifecycle DRAFT→SENT→(PAID\|OVERDUE), OVERDUE→PAID; anything else rejected | Inferred standard practice (C) | `TRANSITIONS` in `src/app/actions/invoices.ts` | planned integration |
| RULE-INV-02 | Invoice numbers unique per org; money stored in minor units | Inferred (C); accounting hygiene | schema + P2002 handling | planned integration |
| RULE-DATA-01 | Rows never cross organizations | Standard SaaS tenancy (C) | scoped queries + FK re-checks | planned security tests |
| RULE-RBAC-01 | MEMBER cannot write clients/invoices; OWNER only org:manage | Assumed baseline (C) | `src/lib/rbac.ts` | ✅ unit tests |
| RULE-AI-01 | AI answers are grounded in org-scoped context only; questions not logged verbatim | Engineering (privacy-by-design) | `src/app/actions/assistant.ts` | manual |
| RULE-PORTAL-01 | Client portal is read-only and scoped to one client via capability token | Inferred from target marketing (B) | `src/app/portal/[token]/page.tsx` | manual |
| RULE-AUTO-01 | Starter has no automation runs; Growth 500/mo; Scale unlimited | Observed (A: structure) | plan catalog (runner pending) | — |

Where evidence is C or lower, the rule is our defensible reconstruction, not a
claim about the target's internals — see ASSUMPTIONS.md.
