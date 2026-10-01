# DATABASE

PostgreSQL via Prisma. Every tenant-owned row carries `orgId` (tenant column
strategy); cross-tenant access is prevented in query construction, and all
mutations re-verify ownership of any client-supplied foreign key.

## Provenance

| Entity | Provenance | Confidence |
| --- | --- | --- |
| User/Organization/Membership | Standard SaaS tenancy; target is org-branded (portal) | C |
| Client / Project / Task | Observed product vocabulary ("clients, projects, files") | B |
| Invoice (status lifecycle) | Observed "GST invoicing, UPI payments" (invoicing inferred generic) | B |
| Decision | Observed "decisions" as first-class memory objects | B |
| Document | Observed "Document Hub / files"; upload/download implemented 2026-09-30 (original field naming) | B (entity), B (impl) |
| AI credits / UsageEvent | Observed per-plan credit allowances | B |
| ApiKey | Engineering addition (not observed on target) | — |
| AuditLog | Engineering addition (required by our security baseline) | — |
| Automation | Observed "Automations, 500 runs/mo"; runner not implemented | B (entity), D (runner) |
| Subscription (billing fields) | Engineering (ADR-017); TRIALING lifecycle evidence-backed (ASSUMPTIONS §8) | — (fields), A (TRIALING) |
| CheckoutSession / BillingEvent | Engineering addition (ADR-017 payment rail; not observed on target) | — |

Money is stored as integer **minor units** (`amountMinor`, paise) — never floats.

## ERD (textual)

```
User 1─* Membership *─1 Organization 1─* Client 1─* Project 1─* Task
                          │              │            │
                          │              ├─* Invoice  └─* Decision
                          │              └─* Document
                          ├─* Decision (org)          Decision *─1 User (author)
                          ├─* AuditLog
                          ├─* UsageEvent
                          ├─* ApiKey
                          ├─* Automation
                          ├─* Invitation
                          ├─* IdempotencyKey
                          ├─* CheckoutSession
                          ├─* BillingEvent
                          └─1 Subscription
User 1─* Session / Account (Auth.js)
User 1─* Notification
Comment: polymorphic-lite — nullable FKs to Decision | Project | Client
```

## Key constraints & indexes

- `Organization.slug` unique; `Client.portalToken` unique (capability).
- `Invoice (orgId, number)` unique — duplicate invoice numbers rejected (P2002).
- `ApiKey.keyHash` unique — lookup by SHA-256; raw key never stored.
- `Invitation.tokenHash` unique — same SHA-256 pattern as API keys; invite
  links are single-use capabilities.
- `Subscription.orgId` unique — exactly one lifecycle row per org. Billing
  fields (`currentPeriodStart/End`, `seats`, `razorpaySubscriptionId`,
  `lastPaymentAt/Id`) are written ONLY by signature-verified webhook
  processing (ADR-017) — never from browser input.
- `CheckoutSession.razorpayOrderId` unique — one provider order per checkout
  attempt; rows are org-scoped and carry the server-computed quote.
- `BillingEvent (provider, eventType, externalId)` unique — webhook
  redeliveries replay as "duplicate"; the ledger is the exactly-once
  authority. Unmappable events are stored with `orgId` null for ops.
- `IdempotencyKey (orgId, scope, key)` unique — retried create submissions
  (same rendered form) replay the original entity instead of duplicating;
  claim and create happen in one serializable transaction. Keys older than
  30 days are prunable (`pruneIdempotencyKeys`).
- `Document.storageKey` unique — one disk object per row; keys are random,
  org-scoped, and never user-derived.
- Hot paths indexed: `(Client orgId,status)`, `(Project orgId,status)`,
  `(Task orgId,projectId,status)`, `(Invoice orgId,status)`,
  `(Decision orgId,createdAt)`, `(AuditLog orgId,createdAt)`,
  `(Document orgId,createdAt)`, `(Invitation orgId,status)`,
  `(Subscription orgId,state)`.

## Blob storage

Document bytes live outside Postgres, under `DOCUMENT_STORAGE_DIR`
(default `/var/lib/bizmemory/documents`), laid out as
`<orgId>/<xx>/<yy>/<random32hex>`. The DB stores metadata only (mime, size,
SHA-256, original name). Backups: `infrastructure/backup.sh` tars the
directory alongside the nightly dump; `infrastructure/restore.sh` untars the
matching archive.

## Migrations

Dev uses `prisma db push`. Production should use `prisma migrate deploy` with
committed migrations (`npm run db:migrate`); create them with
`npx prisma migrate dev` against a dev database before release.

## Backups

See DEPLOYMENT.md §Backups (pg_dump cron + restoration drill).
