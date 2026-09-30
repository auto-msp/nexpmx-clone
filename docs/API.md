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

## Document downloads (session-authenticated)

### `GET /api/download/[documentId]?t=<signed-token>`
Browser downloads for the Document Hub. The `t` token is HMAC-SHA256-signed
by the server when the page renders (5-minute TTL) and binds `documentId` +
`orgId`. The handler independently verifies signature + expiry, the session,
and that the caller's org matches the token's org AND the document's org.

`200` file bytes (`Content-Disposition: attachment`, `Cache-Control:
private, no-store`) · `401` no session · `403` missing/expired/tampered/
foreign-org token (no existence leak) · `404` document not in org, mime no
longer allowlisted, or blob missing from storage · `402` subscription
inactive.

### `GET /portal/[token]/download/[documentId]?t=<signed-token>`
Portal variant: additionally bound to the portal capability token and scoped
to the portal client's own documents. Portal-scoped tokens are rejected on
the app route and vice versa (audience separation). Rate-limited per IP.

## Auth endpoints

`/api/auth/[...nextauth]` — Auth.js v5 handlers (Google OAuth flow).
Browser-only; used by `/login`.

## Server Actions (browser form posts, not public API)

| Action | Permission | Notes |
| --- | --- | --- |
| createClient / archiveClient | client:write | entitlement cap enforced |
| createProject / updateProjectStatus / createTask / setTaskStatus | project:write / task:write | FK re-verified |
| createInvoice / transitionInvoice | invoice:write | state machine + entitlement enforced |
| createDecision | decision:write | |
| buildContextAndAnswer | member | credits metered |
| uploadDocument / deleteDocument | document:write | mime/size/storage caps; trial gated; audit |
| inviteMemberAction / revokeInvitationAction | org:invite | seat cap at invite time; one-time link |
| generateApiKeyAction | org:invite | raw key shown once |

Error convention: thrown errors surface as app error boundary; API routes
return `{ "error": string }` with appropriate status codes.
