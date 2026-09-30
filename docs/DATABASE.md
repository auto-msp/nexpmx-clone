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
| Document | Observed "Document Hub / files"; upload flow not implemented yet | B (entity), D (impl) |
| AI credits / UsageEvent | Observed per-plan credit allowances | B |
| ApiKey | Engineering addition (not observed on target) | — |
| AuditLog | Engineering addition (required by our security baseline) | — |
| Automation | Observed "Automations, 500 runs/mo"; runner not implemented | B (entity), D (runner) |

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
                          └─* Automation
User 1─* Session / Account (Auth.js)
User 1─* Notification
Comment: polymorphic-lite — nullable FKs to Decision | Project | Client
```

## Key constraints & indexes

- `Organization.slug` unique; `Client.portalToken` unique (capability).
- `Invoice (orgId, number)` unique — duplicate invoice numbers rejected (P2002).
- `ApiKey.keyHash` unique — lookup by SHA-256; raw key never stored.
- Hot paths indexed: `(Client orgId,status)`, `(Project orgId,status)`,
  `(Task orgId,projectId,status)`, `(Invoice orgId,status)`,
  `(Decision orgId,createdAt)`, `(AuditLog orgId,createdAt)`.

## Migrations

Dev uses `prisma db push`. Production should use `prisma migrate deploy` with
committed migrations (`npm run db:migrate`); create them with
`npx prisma migrate dev` against a dev database before release.

## Backups

See DEPLOYMENT.md §Backups (pg_dump cron + restoration drill).
