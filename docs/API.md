# API REFERENCE

## Machine API v1

Authentication: `Authorization: Bearer bm_…` (API key minted in Settings;
stored server-side as SHA-256). Org scope is derived from the key.
Rate limit: 60 req/min per org (fixed window).

### `GET /api/v1/clients`
List the org's clients (max 50).

```json
{ "data": [ { "id": "…", "name": "Acme", "company": null,
              "email": null, "status": "ACTIVE", "createdAt": "…" } ] }
```

Errors: `401` missing/invalid key · `429` rate limited · `500` envelope `{ "error": "…" }`.

### `POST /api/v1/clients`
Body (zod-validated): `{ "name": "Acme" (required, ≤120), "company"?: string, "email"?: string }`
→ `201` with created client · `422` validation · `401`/`429` as above.
Side effects: creates client + portal token; writes audit event.

### `GET /api/v1/invoices`
List the org's invoices (max 50) with client name, amountMinor, status, dueAt.

## Utility endpoints

### `GET /api/health`
`200 {"status":"ok","db":true}` or `503 {"status":"degraded","db":false}`.
Use for uptime checks and load-balancer probes. (No auth by design.)

## Auth endpoints

`/api/auth/[...nextauth]` — Auth.js v5 handlers (Google OAuth flow).
Browser-only; used by `/login`.

## Server Actions (browser form posts, not public API)

| Action | Permission | Notes |
| --- | --- | --- |
| createClient / archiveClient | client:write | entitlement cap enforced |
| createProject / updateProjectStatus / createTask / setTaskStatus | project:write / task:write | FK re-verified |
| createInvoice / transitionInvoice | invoice:write | state machine enforced |
| createDecision | decision:write | |
| buildContextAndAnswer | member | credits metered |
| generateApiKeyAction | org:invite | raw key shown once |

Error convention: thrown errors surface as app error boundary; API routes
return `{ "error": string }` with appropriate status codes.
