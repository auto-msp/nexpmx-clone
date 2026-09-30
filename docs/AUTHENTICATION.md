# AUTHENTICATION

## Provider

Google OAuth via Auth.js v5 (`next-auth@5 beta`) with the Prisma adapter.

- **Session strategy: database** — server-revocable; sessions live in the
  `Session` table, referenced by an HttpOnly, SameSite=Lax cookie
  (`authjs.session-token`, `__Secure-` prefixed on HTTPS).
- **Sign-in bootstrap**: on first sign-in, `ensureDefaultOrgForUser()` creates
  the user and a default Organization + Membership. Users listed in
  `OWNER_EMAILS` become `OWNER`; everyone else is `MEMBER`.
- **Pages**: custom `/login` (target-observed `callbackUrl` honored,
  same-origin-validated to block open redirects).

## Lifecycle

```
UNAUTHENTICATED ──Google OAuth──▶ AUTHENTICATED ──membership──▶ ACTIVE
       ▲                                │
       └──── sign out (session row deleted) ─┘
```

- Sign-out deletes the DB session (revocation is immediate, not just cookie-clearing).
- Session expiry handled by Auth.js (30 days default; configurable).
- Middleware gate: cookie presence ⇒ coarse gate; `auth()` ⇒ real check.

## Observed-vs-implemented

| Behavior | Provenance |
| --- | --- |
| `/overview` → `/login?callbackUrl=%2Foverview` when logged out | Observed (A) |
| Google sign-in | Observed (A) |
| Database sessions, HttpOnly cookies, immediate revocation | Engineering choice (C) |
| MFA / device management | Not implemented — see KNOWN_LIMITATIONS.md |

## Hardening defaults

- `AUTH_SECRET` required in production (32+ random bytes).
- OAuth credentials scoped to the minimum; refresh tokens not requested.
- No secrets in logs; audit records identity only, never tokens.
