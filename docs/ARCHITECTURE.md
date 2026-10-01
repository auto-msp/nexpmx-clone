# ARCHITECTURE

## Stack (see DECISIONS.md for rationale)

```
Next.js 15 (App Router, RSC)  →  single deployable unit
  ├─ Route Groups: (marketing) public · (app) session-gated
  ├─ Server Actions             →  mutations (auth → RBAC → zod → Prisma → audit)
  ├─ Route Handlers /api/v1     →  API-key machine surface
  ├─ Middleware (edge)          →  coarse login gate (never authorization)
  └─ Auth.js v5 + PrismaAdapter →  Google OAuth, DB sessions
Prisma + PostgreSQL            →  relational business memory
Tailwind CSS v4 (@theme)       →  design tokens
Vitest                         →  unit tests
Caddy + systemd (Oracle)       →  TLS + process supervision
```

## Request flows

### Page read (RSC)

```
Browser → Caddy (TLS) → Next.js
  → middleware (public? session cookie present?)
  → RSC page → auth() → getOrgContext(userId)   # tenant scope
  → prisma (org-scoped query) → HTML
```

### Mutation (Server Action)

```
Form POST → Server Action
  → requireApiContext()          # session → 401
  → requirePermission(role,perm) # RBAC → 403
  → zod parse                    # 422
  → ownership/FK re-check        # IDOR defense
  → entitlement check            # 402 where applicable
  → prisma write
  → audit(...)                   # never blocks on failure
  → revalidatePath
```

### AI question

```
/assistant?q= → buildContextAndAnswer()
  → credit check (402 when exhausted)
  → org-scoped LIKE search across clients/projects/invoices/decisions
  → AiProvider.answer(question, context)     # stub by default
  → increment aiCreditsUsed + UsageEvent
  → audit (metadata only, no question content)
```

### Payment webhook (ADR-017)

```
Razorpay → POST /api/webhooks/razorpay
  → verify HMAC-SHA256(raw body, RAZORPAY_WEBHOOK_SECRET)  # 400 on failure
  → zod parse envelope                                     # 400 on garbage
  → map org (order notes) → load CheckoutSession by order id
  → BillingEvent ledger (provider,eventType,externalId UNIQUE)
      duplicate → 200 "duplicate", no side effects
      unmapped  → 200 "unmapped", stored for ops, never applied
  → activatePlan / markPastDue via the subscription FSM
  → audit (ids/plan/seats only) → 200 "processed"
```

The browser never declares a subscription active: the checkout callback is
UX-only. All state writes flow through the webhook or the audited OWNER
fallback action.

## Trust boundaries

```
Internet ── Caddy (TLS, HSTS) ── Next.js (app)
                                   │
                  ┌────────────────┼─────────────────┐
                  │                │                 │
              Auth.js          PostgreSQL       AI provider (optional)
        (Google OAuth,       (the only          (adapter; stub has
         DB sessions)         stateful zone)     no external calls)
```

- **Public zone**: marketing routes, /login, /api/health.
- **Authenticated zone**: (app) routes — session + org membership required.
- **Billing zone**: /billing + /billing/checkout — session-gated but OUTSIDE
  the expired-trial gate (an expired org must be able to check out);
  /api/webhooks/razorpay — HMAC-verified, no session.
- **Portal zone**: /portal/[token] — capability token, read-only, scoped to one client.
- **Machine zone**: /api/v1 — hashed API keys, org-scoped, rate-limited.
- **Data zone**: PostgreSQL — all rows carry `orgId`; access only via scoped queries.

## Deliberate non-goals

- No microservices: one Node process + one DB covers the domain at this scale.
- No Redis yet: rate limiting is in-process (documented limitation); caching is
  RSC + Next defaults. Add Redis when multi-instance deployment arrives.
- No queue yet: no workload currently justifies one; email/billing events will.
