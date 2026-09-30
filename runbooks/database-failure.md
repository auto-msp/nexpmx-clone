# Incident: Database unavailable or failing

## Purpose

PostgreSQL is down, unreachable, or erroring. Restore the datastore the
application depends on.

## Impact

Everything touching tenant data: login (Auth.js uses DB sessions), dashboard,
clients, projects, invoices, decisions, documents metadata, invitations,
subscriptions. `/api/health` reports 503 `db:false`. Marketing pages keep
serving (static, no DB). Full DB loss without backups is P0 data loss.

## Symptoms

- `curl http://127.0.0.1:3000/api/health` → `503 {"status":"degraded","db":false}`
- App pages render but every action errors (actions throw; API returns
  `500 {"error":"Internal error"}` after `[api] unhandled` in logs)
- Logins fail (sessions live in the `Session` table)
- `journalctl -u bizmemory` shows Prisma `P1001` (can't reach DB) /
  connection-refused errors

## Severity

P0 if data loss is possible; P1 for a plain availability failure.

## Immediate Actions

1. Confirm it is the DB, not the app:
   ```bash
   curl -s http://127.0.0.1:3000/api/health      # db:false
   sudo systemctl status postgresql
   ```
2. If Postgres is down: `sudo systemctl start postgresql`, then re-check
   health. (On the dev/CI docker setup the equivalent is
   `docker start bizmemory-pg` — do NOT run destructive flags like
   `--rm`/`down -v` against any real volume.)
3. If Postgres is up but the app cannot reach it, check connectivity values:
   the app uses `DATABASE_URL` from `/opt/bizmemory/.env` (verified: local
   Postgres, loopback). Confirm the role/db exist:
   ```bash
   sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='bizmemory'"
   sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='bizmemory'"
   ```

## Diagnosis

```bash
sudo -u postgres psql -c "SELECT count(*) FROM pg_stat_activity;"  # connections
tail -50 /var/log/postgresql/*.log                                  # PG errors
df -h /var/lib/postgresql                                           # disk full stops PG
journalctl -u bizmemory -n 50 --no-pager                            # exact Prisma error
```

- Connection-pool exhaustion: `pg_stat_activity` counts near the Prisma pool
  limit; restart `bizmemory` to release the pool after fixing the cause.
- Disk full on the PG volume: free space first — Postgres refuses writes when
  the volume is exhausted and may shut down.

## Recovery

- Availability: start Postgres, then verify the app reconnects (Prisma
  reconnects lazily; if not, `sudo systemctl restart bizmemory`).
- Data corruption / accidental deletion → `data-recovery.md` (REQUIRES HUMAN
  APPROVAL for any restore over live data).
- Missing role/database after a VM restore → recreate per
  `docs/DEPLOYMENT.md` §2, then restore from backup via `data-recovery.md`.

## Validation

```bash
curl -fsS http://127.0.0.1:3000/api/health   # {"status":"ok","db":true}
```
Then log in and confirm one real read + one real write per surface
(clients list loads; creating a test decision succeeds and appears).

## Rollback

No verified rollback mechanism found for the database itself (in-repo
rollback is code-only — see `deployment-rollback.md`). Recovery path is
backup restore, covered by `data-recovery.md`.

## Escalation

Escalate immediately when: `pg_dump` restore is being considered (human
decision), data loss is suspected, or the filesystem holding PG data has
errors.

## Do Not

- Do not run `prisma migrate reset`, `DROP DATABASE`, or `db push
  --accept-data-loss` against production.
- Do not point `DATABASE_URL` at another environment's database to "get
  running" — cross-tenant contamination.
- Do not restart Postgres with `kill -9`; use systemctl.

## Root Cause Follow-Up

- Check the nightly backup actually ran: `ls -lh /var/backups/bizmemory-*`
  (cron exit code is the alert — `docs/OBSERVABILITY.md` §Alerting).
- Review connection-pool sizing if exhaustion recurs (single PrismaClient,
  verified in `src/lib/db.ts`).
- Enable external uptime monitoring on `/api/health` if not already wired
  (NOT VERIFIED in-repo whether an external monitor exists).
