# Runbooks

Operational recovery guides for BizMemory in production. Each file is one
incident type, ordered for "production is broken, what do I check right now?"

Architecture context lives in `docs/ARCHITECTURE.md`; this directory assumes
it. Deployment topology (verified): single Oracle VM — Caddy :443 → Next.js on
127.0.0.1:3000 (systemd unit `bizmemory`) → local PostgreSQL; document files
on local disk under `DOCUMENT_STORAGE_DIR` (default
`/var/lib/bizmemory/documents`); nightly backups by cron.

## Index

| File | Incident | Severity |
| --- | --- | --- |
| `application-down.md` | App unhealthy / returning 5xx / 502 from Caddy | P1 (P0 if prolonged) |
| `database-failure.md` | Postgres unavailable / degraded health | P0–P1 |
| `document-storage-failure.md` | Uploads/downloads broken, disk full, permissions | P1 |
| `deployment-rollback.md` | Failed deploy; revert to last good version | P1 |
| `oauth-login-failure.md` | Nobody can sign in (Google OAuth broken) | P1 |
| `data-recovery.md` | Data loss / corruption; restore from backup | P0 |
| `secret-compromise.md` | Leaked AUTH_SECRET / API key / OAuth secret | P0 |

## Golden signals (verified)

```bash
curl -fsS http://127.0.0.1:3000/api/health
# 200 {"status":"ok","db":true}  ·  503 {"status":"degraded","db":false}

systemctl status bizmemory
journalctl -u bizmemory -n 100 --no-pager
```

## Conventions used in these runbooks

- **SAFE AUTOMATION** — commands an operator (or agent) may run directly:
  read-only checks, health probes, service restarts via systemd.
- **REQUIRES HUMAN APPROVAL** — destructive or state-changing actions:
  restoring databases over live data, direct SQL writes, credential
  rotation, DNS changes. Never automated, never run without an explicit
  human go-ahead.
- `NOT VERIFIED` marks facts that could not be confirmed from the repository
  (e.g. whether an external uptime monitor is wired up — none exists in-repo).

## Explicitly out of scope (do not create runbooks for)

Queues, workers, Redis/cache, email delivery, feature flags — none of these
exist in the current system (verified against the codebase;
see `docs/KNOWN_LIMITATIONS.md`).

Payments no longer fall in this list as of 2026-10-01 (ADR-017): a Razorpay
webhook receiver and checkout exist. Webhook-secret handling is covered in
`secret-compromise.md`; provider-side incidents (Razorpay dashboard/outage)
are handled at the provider, with our side degrading to contact-us checkout
mode when keys are absent. A dedicated payments runbook (failed-webhook
reconciliation, missed activations) is pending until live keys exist.
