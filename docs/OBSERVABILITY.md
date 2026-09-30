# OBSERVABILITY

## Health

`GET /api/health` → `200 {"status":"ok","db":true}` / `503 {"status":"degraded","db":false}`.
Point an external uptime monitor at it; systemd handles crash-restarts.

## Logging

- App logs go to stdout/stderr → `journalctl -u bizmemory`.
- Unhandled API errors log `[api] unhandled` with the error (no request secrets).
- Audit failures log `[audit] failed to persist audit event` — audit is
  failure-tolerant by design so it never breaks user requests.

**Redaction policy (enforced by convention + review):**
never log passwords, tokens, API keys, session cookies, or raw AI questions.
The assistant audit event stores `questionLength`, not content.

## Audit trail

`AuditLog` rows: org, actor, action (`client.created`, `invoice.status_changed`,
`ai.query`, `apikey.created`, `org.created`, …), entity, entity id, redacted
JSON metadata, timestamp. Viewable in Settings → Recent audit log (latest 20).

Retention: unbounded for now; add a partitioning/roll-off policy when volume
warrants (documented in KNOWN_LIMITATIONS.md).

## Metrics (recommended additions)

- Process: Node event-loop lag, RSS (via PM2/systemd exporter or Node built-ins).
- Postgres: connection pool saturation, slow queries (`pg_stat_statements`).
- Business: UsageEvent counts per org (credits consumption) — already persisted.

## Alerting

Start with: health endpoint down > 2 min, 5xx rate spike, disk > 80%,
`pg_dump` failure (backup cron exit code).
