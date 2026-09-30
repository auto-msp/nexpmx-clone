# Incident: Suspected secret compromise

## Purpose

A credential may have been exposed: `AUTH_SECRET`, a `bm_…` API key, Google
OAuth client secret, database password, or an unredacted HAR/session export.
Contain, rotate, and verify.

## Impact

Depends on the secret:
- **AUTH_SECRET** — forging it enables signed download links for any
  document in any org (verified: HMAC covers documentId+orgId; portal tokens
  add a claim but sessions remain the second gate) and session-token crypto.
- **API key** — full machine read/write of clients via `/api/v1/*` within
  rate limits (60 req/min per org).
- **DB password** — direct data access, bypassing the app entirely.
- **OAuth client secret** — impersonation of the app's login flow.

## Symptoms

- A secret committed to git, pasted in a ticket/chat, or present in logs
- Unredacted HAR received (contains `cookie` / `authorization` /
  `set-cookie` headers — the evidence checklist rejects these)
- Audit log shows `document.downloaded` / `client.created` events nobody
  accounts for
- Unknown API keys in Settings, or unexpected `[api]` activity at odd hours

## Severity

P0.

## Immediate Actions

1. **Contain the exposed channel** (stop the bleeding before rotating):
   - Secret in a ticket/PR/chat: delete where possible; git history still
     has it — rotation is mandatory, history rewrite is not (see Do Not).
   - Unredacted HAR received: delete it unprocessed (project policy:
     rejected, never used).
   - Compromised API key: revoke now (reversible, verified schema has
     `ApiKey.revokedAt`):
     ```bash
     sudo -u postgres psql bizmemory -c \
       "UPDATE \"ApiKey\" SET \"revokedAt\"=now() WHERE prefix='<leaked-prefix>';"
     ```
     (REQUIRES HUMAN APPROVAL — it breaks that integration's callers.)
2. Determine what was exposed and for how long: audit log + git history +
   ticket trails.

## Diagnosis

- **API key abuse check** (org-scoped, actions are audited):
  ```bash
  sudo -u postgres psql bizmemory -c \
    "SELECT action, count(*), max(\"createdAt\") FROM \"AuditLog\" \
     WHERE action LIKE 'client.%' GROUP BY 1 ORDER BY 3 DESC LIMIT 20;"
  ```
- **Download-link abuse check**: `document.downloaded` events with volume or
  targets that don't match business activity.
- **Unexplained API-key creation**: `apikey.created` events and their actor.
- Verify current key inventory: Settings → API access (prefixes only; raw
  keys are never stored — SHA-256 only, verified in `src/lib/tenancy.ts`).

## Recovery

Rotation matrix (all REQUIRES HUMAN APPROVAL; none are automated):

| Secret | Where | Effect of rotation |
| --- | --- | --- |
| `AUTH_SECRET` | `/opt/bizmemory/.env` + restart | invalidates all sessions, all outstanding signed download links |
| API keys | revoke row + mint new in Settings | new raw key shown once to the org owner |
| `AUTH_GOOGLE_SECRET` | Google Cloud Console + `.env` + restart | login works again after update |
| DB password | Postgres role + `.env` + restart | app reconnects with new creds |

Mechanics (same pattern every time): update the value in the Google/DB
console where applicable → update `/opt/bizmemory/.env` →
`sudo systemctl restart bizmemory` → validate login and health.

If abuse is confirmed, treat affected data per `data-recovery.md` and notify
affected orgs.

## Validation

- Logins work for a real user after rotation.
- Old API key returns 401; new key returns 200 on `GET /api/v1/clients`.
- Outstanding (pre-rotation) download links now fail with 403 — expected.
- Health `{"status":"ok","db":true}`; no anomalous audit events after the
  rotation timestamp.

## Rollback

No verified rollback mechanism found for secret rotation — rotation is
one-way by design. Keep the old `.env` values only in a secure vault for
emergency comparison, never in the repo.

## Escalation

Escalate to the responsible humans immediately for: any confirmed data
access by an attacker, Google Cloud Console changes, and the decision to
force global session invalidation during business hours.

## Do Not

- Do not attempt to rewrite git history to "remove" a committed secret —
  it is already exposed; rotate instead. Force-pushing also breaks CI/deploy
  history.
- Do not paste the leaked value into new tickets, runbooks, or logs.
- Do not rotate unrelated credentials "while you're at it" — each rotation
  has user-visible effects; scope it.
- Do not keep an unredacted HAR; destroy it per the evidence policy.

## Root Cause Follow-Up

- Find how the secret leaked (log redaction gap? PR attached files?
  screenshot?) and fix the process, not just the value.
- Confirm secret-scanning is enabled on the GitHub repo.
- Review `docs/SECURITY.md` redaction conventions with the team.
