# BACKEND

## Layers

```
src/app/actions/*      Server Actions  (browser mutations)
src/app/api/v1/*       Route Handlers  (machine API, API-key auth)
src/app/api/health     Route Handler   (ops probe)
src/lib/*              Domain services (auth, tenancy, rbac, plans, ai, audit, api)
prisma/schema.prisma   Data model
```

## Server Action contract

Every mutation follows the same pipeline (see ARCHITECTURE.md):

1. `requireApiContext()` — session + membership (401)
2. `requirePermission(role, perm)` — RBAC (403)
3. zod validation (422)
4. Ownership re-check of client-supplied FKs (IDOR defense)
5. Entitlement check where applicable (402)
6. Prisma write
7. `audit()` (failure-tolerant)
8. `revalidatePath()`

## AI adapter

`src/lib/ai.ts` defines `AiProvider { answer(question, context) }`.

- **stub** (default): keyword-scores the provided org context, returns a
  deterministic grounded answer + sources; 1 credit per successful match.
- To add a real vendor: implement `AiProvider` with the vendor SDK (their
  privacy policy mentioned Claude; any vendor fits) and select it in
  `getAiProvider()`. Context assembly, metering, and audit are provider-agnostic.

Context assembly is `orgId`-scoped LIKE searches across clients, projects,
invoices and decisions (README limits apply). A production-grade vector or
full-text index is a documented upgrade path — see KNOWN_LIMITATIONS.md.

## Error handling

- API routes: uniform `{ error }` envelope; HttpError carries status.
- Server Actions: errors bubble to the (app) error boundary (user-safe copy +
  digest reference; server logs the detail).
- Health: 503 when DB is unreachable (readiness semantics).
