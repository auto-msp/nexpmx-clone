# Incident: Failed production deployment / rollback needed

## Purpose

A deploy (`infrastructure/deploy.sh` or manual) left the app broken, or the
build/migration steps failed mid-deploy. Restore the last known-good
version.

## Impact

Users see 502s, 5xx errors, or broken behavior proportional to what failed.
A failed migration can take the DB schema partially forward.

## Symptoms

- `deploy.sh` exits with "Deploy FAILED: health check did not pass"
- Health flaps 200 → 503/500 right after a deploy
- `journalctl -u bizmemory` shows module-not-found / build-time errors
- New feature paths error while old ones still work (partial deploy)

## Severity

P1 (P0 if health never returns).

## Immediate Actions

1. Stop deploying. Do not "fix forward" blindly while users are impacted.
2. Verify current state:
   ```bash
   systemctl status bizmemory
   curl -s http://127.0.0.1:3000/api/health
   journalctl -u bizmemory -n 50 --no-pager
   ```
3. Identify the last good commit:
   ```bash
   cd /opt/bizmemory && git log --oneline -5
   ```

## Diagnosis

Determine which stage failed (deploy order is verified in
`infrastructure/deploy.sh`: pull → npm ci → `prisma migrate deploy` → build →
restart → health gate):

- **pull/ci failed** → working tree is intact; nothing changed. Safe to retry
  after fixing the cause.
- **migrate deploy failed** → check migration state:
  `sudo -u postgres psql bizmemory -c '\\d _prisma_migrations'` and the error
  output. Migrations are forward-only in this repo (no down migrations
  exist — verified: `prisma/migrations/` is not used; dev uses `db push`).
- **build failed** → `npm run build` locally on the same commit to see the
  error; the running service is untouched.
- **restart + health gate failed** → the new build is broken at runtime; roll
  back (below).

## Recovery

Roll back to the last good commit:

```bash
cd /opt/bizmemory
git log --oneline -5                 # find last good
sudo git checkout <last-good-sha>    # or: git revert <bad-sha> for fix-forward
npm ci --no-audit --no-fund
npx prisma migrate deploy            # no-op if no new migrations
npm run build
sudo systemctl restart bizmemory
curl -fsS http://127.0.0.1:3000/api/health
```

This mirrors the verified deploy procedure; `deploy.sh` itself has no
built-in rollback (verified: it only `git pull --ff-only` forward).

If the failure was a bad migration that already applied: do **not** try to
hand-roll a schema downgrade in the incident. Restore DB + code together
from before the deploy — REQUIRES HUMAN APPROVAL, see `data-recovery.md`.

## Validation

- Health: `{"status":"ok","db":true}`
- `curl -s -o /dev/null -w '%{http_code}' https://<domain>/pricing` → 200
- `/overview` → 307 to `/login?callbackUrl=%2Foverview` (auth gate intact)
- Log in; exercise one read and one write on a core surface.
- CI is green on the commit now running (github.com/auto-msp/nexpmx-clone).

## Rollback

This runbook *is* the rollback path. If the rollback itself fails, pin the
service to the previous `.next` build is NOT verified as possible (builds
are overwritten in place) — next step is fixing the rollback commit.

## Escalation

Escalate when a migration has partially applied (schema vs code drift) —
that combination needs a human to decide restore-vs-forward-fix.

## Do Not

- Do not run `prisma migrate resolve` or edit `_prisma_migrations` unless you
  fully understand the failed migration.
- Do not force-push main to "undo" a bad commit — it breaks the deploy
  history and CI trail.
- Do not deploy untested changes on top of a broken state.

## Root Cause Follow-Up

- The failed commit should not have passed CI — find the gap
  (`.github/workflows/ci.yml`) and add the missing check.
- Consider a staging environment (DEPLOYMENT.md §Environments lists it as
  recommended but NOT VERIFIED as existing).
