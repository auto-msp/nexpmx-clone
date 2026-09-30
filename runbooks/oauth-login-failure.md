# Incident: Nobody can log in (Google OAuth broken)

## Purpose

Sign-in fails for all or some users: redirect errors, OAuth `error`
callbacks, or sessions that do not persist. Restore authentication.

## Impact

All authentication: app users cannot reach any session-gated surface.
Client portals (`/portal/[token]`) are token-authenticated and keep working.
Invitation links keep rendering but acceptance requires login.

## Symptoms

- `/login` → Google → error page (`redirect_uri_mismatch`,
  `invalid_client`, `access_blocked`) or a bounce back to `/login`
- Login "succeeds" but the user bounces straight back to `/login`
  (session row not persisting → DB problem; see `database-failure.md`)
- Middleware keeps redirecting: `/overview` →
  `/login?callbackUrl=%2Foverview` loops

## Severity

P1 (complete lockout of authenticated surfaces; no data loss).

## Immediate Actions

1. Classify with one curl — the auth gate itself is verified working if:
   ```bash
   curl -s -o /dev/null -w '%{http_code} %{redirect_url}' \
     http://127.0.0.1:3000/overview
   # 307 -> /login?callbackUrl=%2Foverview
   ```
2. If that loop works but OAuth fails, the problem is between the app and
   Google, or session persistence:
   ```bash
   curl -s http://127.0.0.1:3000/api/health   # db:false ⇒ sessions can't persist
   ```
3. Check the OAuth config env vars exist in `/opt/bizmemory/.env`:
   `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_SECRET`, `AUTH_URL`.
   (Names verified in `src/lib/auth.ts` + `.env.example`; never echo their
   values into tickets or logs.)

## Diagnosis

- **`redirect_uri_mismatch`** → the OAuth client's authorized redirect URI
  must be exactly `AUTH_URL + /api/auth/callback/google`
  (`docs/DEPLOYMENT.md` §3). Common after a domain change or adding www.
- **`invalid_client`** → `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` wrong,
  swapped, or truncated (check for quoting issues in `.env`).
- **Login loops back to `/login`** → DB sessions: check the `Session` table
  received a row during a fresh attempt; if not, treat as
  `database-failure.md`.
- **All users fail after a deploy** → Auth.js version/config change; roll
  back per `deployment-rollback.md`.
- **One user fails** → their Google account/org policy, or the invite email
  mismatch (invite links are bound to the invited address — verified in
  `src/app/invite/[token]/page.tsx`). Not an outage; handle individually.

## Recovery

- Correct `AUTH_URL` or OAuth redirect URI in the Google Cloud console, then
  `sudo systemctl restart bizmemory` (env is read at process start).
- Corrupted `AUTH_SECRET` (e.g. truncated): setting the correct value
  restores logins. **Note**: rotating `AUTH_SECRET` invalidates existing
  sessions and signed download links — REQUIRES HUMAN APPROVAL, and see
  `secret-compromise.md` for the rotation procedure.
- DB-related causes → `database-failure.md`.

## Validation

- Full real login: `/login` → Google → `/overview` renders the dashboard.
- Session persists across a new request (reload the page; no bounce).
- Health endpoint still `{"status":"ok","db":true}`.

## Rollback

If login broke after a deploy (Auth.js config/dependency change), roll back
per `deployment-rollback.md`. There is no auth-specific rollback mechanism
beyond that.

## Escalation

Escalate when Google-side diagnostics are needed (OAuth consent/verification
status in the Google Cloud console) — that access is human-held.

## Do Not

- Do not disable the auth gate or add bypass routes to "restore access".
- Do not log or paste OAuth secrets/tokens in tickets; redact.
- Do not rotate `AUTH_SECRET` casually — it invalidates every active session
  and all outstanding signed download links.

## Root Cause Follow-Up

- Add an OAuth-callback smoke check to CI if the failure was config drift.
- Document the exact redirect URI in DEPLOYMENT.md if it was wrong/missing.
