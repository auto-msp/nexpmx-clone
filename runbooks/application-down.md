# Incident: Application down or returning errors

## Purpose

The Next.js app (systemd unit `bizmemory`) is unreachable, crash-looping, or
returning 5xx / 502. Restore serving of traffic.

## Impact

Everything is served by the single Node process: marketing pages, app, API,
client portals, document downloads. If Caddy is healthy but the app is not,
users see 502. Complete outage is P0.

## Symptoms

- `curl http://127.0.0.1:3000/api/health` → connection refused / timeout, or
  `503 {"status":"degraded","db":false}` (that variant means DB — see
  `database-failure.md`)
- Public URL returns 502 (Caddy up, app down)
- `systemctl status bizmemory` → inactive/failed, or restarting repeatedly
- `journalctl -u bizmemory` shows crash stack traces

## Severity

P1 (becomes P0 if prolonged — the whole product is this process).

## Immediate Actions

1. Check whether the process is running at all:
   ```bash
   systemctl status bizmemory
   ```
2. If stopped: `sudo systemctl start bizmemory` (unit has
   `Restart=always` + 3s delay, so crashes normally self-heal — repeated
   restarts mean the crash is deterministic; go to Diagnosis).
3. Confirm health:
   ```bash
   curl -fsS http://127.0.0.1:3000/api/health
   ```
4. If health is 503 with `db:false`, switch to `database-failure.md` — the
   app is fine, the database is not.

## Diagnosis

```bash
journalctl -u bizmemory -n 200 --no-pager   # crash reason, stack trace
ss -tlnp | grep 3000                        # is anything listening?
df -h /var /opt                             # disk-full kills writes and builds
free -h                                     # OOM kills show in dmesg
sudo dmesg | tail -50                       # OOM / segfault evidence
```

Common verified causes from the codebase:

- **Missing/invalid env**: the unit loads `EnvironmentFile=/opt/bizmemory/.env`.
  Missing `AUTH_SECRET` breaks Auth.js at request time; missing `DATABASE_URL`
  breaks every DB query. Check `.env` exists and is readable by `www-data`.
- **Port conflict**: something else grabbed :3000 (`ss -tlnp`).
- **Bad build artifacts**: `.next` present but stale/corrupt — rebuild
  (see `deployment-rollback.md`).
- **Crash loop**: read the stack trace; fix-forward via
  `deployment-rollback.md` if the previous deploy introduced it.

## Recovery

- Crash after a deploy → roll back: `deployment-rollback.md`.
- Crash loop with no deploy → fix the underlying cause found in Diagnosis,
  then `sudo systemctl restart bizmemory`.
- Disk full → free space (old `server.log`/backups), then restart.

## Validation

```bash
curl -fsS http://127.0.0.1:3000/api/health          # {"status":"ok","db":true}
curl -s -o /dev/null -w '%{http_code}' https://<domain>/pricing   # 200
curl -s -o /dev/null -w '%{http_code}' https://<domain>/overview  # 307 to /login
```

The `/overview → 307 /login?callbackUrl=%2Foverview` behavior is the
verified auth-gate smoke check.

## Rollback

See `deployment-rollback.md`. If the crash is not deploy-related, there is
no in-repo rollback mechanism beyond redeploying a known-good commit
(verified: `infrastructure/deploy.sh` only pulls forward, `--ff-only`).

## Escalation

Stop and escalate when: the stack trace is not actionable, health stays 503
with `db:true` (unknown app-level failure), or the VM itself is unhealthy
(disk/OOM recurring).

## Do Not

- Do not run `npm run dev` as a substitute for the systemd service.
- Do not edit `.env` values ad hoc to "fix" a crash — wrong
  `DATABASE_URL`/`AUTH_SECRET` changes look like an outage for every user.
- Do not delete `.next`/`node_modules` while the service is running.

## Root Cause Follow-Up

- Add the failing scenario to the smoke suite (`.github/workflows/ci.yml`)
  or `docs/TESTING.md` backlog.
- If OOM: profile memory; downloads currently buffer whole files (25 MB cap
  bounds this — `docs/KNOWN_LIMITATIONS.md` #15).
- Record the incident timeline in the audit log review
  (`docs/OBSERVABILITY.md`).
