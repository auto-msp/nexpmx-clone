# SECURITY

## Implemented controls

| Area | Control |
| --- | --- |
| Transport | TLS via Caddy; HSTS (2y, preload) on all responses |
| Cookies | HttpOnly, SameSite=Lax session cookie; Secure on HTTPS; no tokens in JS |
| AuthN | Google OAuth; DB sessions (immediate revocation); `AUTH_SECRET` required |
| AuthZ | RBAC matrix server-side; org-scoped queries; FK re-verification (anti-IDOR) |
| Input | zod validation on every action/route; max lengths; enum whitelists |
| Output | React auto-escaping; no `dangerouslySetInnerHTML` anywhere |
| SQL | Prisma parameterized queries only |
| CSRF | Next.js Server Actions origin checks + SameSite cookies |
| Open redirect | `callbackUrl` restricted to same-origin relative paths |
| Rate limiting | Fixed-window limiter on AI + API + portal (in-process; see limitations) |
| Payload limits | Form/API field length caps; Next body limits default |
| Headers | CSP, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy |
| Secrets | Never committed; `.env` git-ignored; API keys stored as SHA-256 hashes; portal tokens hashed for audit |
| Audit | Append-only AuditLog (actor, action, entity, redacted metadata) |
| Logging | No secrets/PII; AI questions logged as length only |
| Deps | Lockfile committed; `npm audit` in CI recommended |

## Threat model (STRIDE, abridged)

```
Internet ─|─ Caddy ─|─ Next.js ── PostgreSQL
                        └── Google OAuth / (optional) AI vendor
```

| Threat | Vector | Control | Residual risk |
| --- | --- | --- | --- |
| Spoofing | Stolen session cookie | DB session revocation, HttpOnly, Secure | Low |
| Spoofing | Forged portal link | 128-bit random token, rate-limited lookup | Low |
| Tampering | Mass assignment | zod schemas; explicit field selection | Low |
| Repudiation | Disputed changes | AuditLog with actor + entity | Medium (no tamper-proofing/WORM yet) |
| Info disclosure | IDOR across orgs | org-scoped queries + FK re-checks | Low |
| Info disclosure | AI context leakage | context assembled org-scoped only | Low |
| DoS | AI/API abuse | per-key/per-IP fixed-window limits | Medium (single-instance limiter) |
| Elevation | Role escalation via client input | role read from Membership server-side | Low |
| Injection | SQL/JS | Prisma + React escaping | Low |

## Security difference report (target vs reconstruction)

| Area | Target evidence | This repo | Note |
| --- | --- | --- | --- |
| Auth gate | 302→login with callbackUrl (A) | Same behavior, verified | parity |
| AuthN | Google OAuth (A) | Google OAuth + DB sessions | parity+ |
| Security headers | Unknown (D) | Full baseline | engineering addition |
| Rate limiting | Unknown (D) | Present (in-process) | engineering addition |
| Audit trail | Unknown (D) | Present | engineering addition |

No security control was *removed* to imitate the target; where the target's
implementation is unknowable, we implemented the stricter default and marked
it as an engineering addition.
