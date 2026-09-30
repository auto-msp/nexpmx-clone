# Incident: Data loss or corruption (restore from backup)

## Purpose

Production data was lost, corrupted, or wrongly modified (bad migration,
human error, storage failure, compromised data). Restore a consistent state
from backups with minimal loss.

## Impact

Potentially everything: tenant records, documents, audit history. Scope the
blast radius first — a single wrong row does not justify a full restore.

## Symptoms

- Missing/malformed rows reported by users or visible in the app
- Prisma errors referencing missing tables/columns after a migration
- Document rows exist but files are gone (or vice versa) — see also
  `document-storage-failure.md`
- Restore drill (`infrastructure/restore.sh`) reveals dump problems

## Severity

P0.

## Immediate Actions

1. **Stop writes that could worsen the damage.** If the app itself is
   causing corruption (bad deploy), stop it:
   `sudo systemctl stop bizmemory` — REQUIRES HUMAN APPROVAL if users are
   actively working.
2. Freeze the evidence: note exact time of the incident; identify the newest
   known-good backup **before** touching anything:
   ```bash
   ls -lh /var/backups/bizmemory-*.dump /var/backups/bizmemory-documents-*.tar.gz
   ```
3. Snapshot the current (damaged) state before any restore:
   ```bash
   sudo -u postgres pg_dump -Fc bizmemory > /var/backups/bizmemory-DAMAGED-$(date +%F-%H%M).dump
   ```

## Diagnosis

- Verify the dump is intact and non-empty
  (backup.sh itself refuses empty dumps):
  ```bash
  pg_restore --list /var/backups/bizmemory-YYYY-MM-DD.dump | head -20
  ```
- Determine what to restore: full database, specific tables
  (`pg_restore --table=...`), or documents tarball only.
- Cross-check row counts against the drill output
  (`restore.sh` prints counts of users/clients/projects/invoices/decisions).

## Recovery

**Every restore over live data is REQUIRES HUMAN APPROVAL.** The verified
tooling (`infrastructure/restore.sh`) is designed for this:

1. **Drill first (safe, no production impact):**
   ```bash
   sudo ./infrastructure/restore.sh /var/backups/bizmemory-YYYY-MM-DD.dump
   # restores into scratch DB bizmemory_restore; verify row counts
   sudo -u postgres dropdb bizmemory_restore    # cleanup after verification
   ```
2. **Live restore (only with explicit human sign-off):**
   ```bash
   sudo TARGET=bizmemory FORCE=1 ./infrastructure/restore.sh <dump-file>
   # refuses to run without FORCE=1; restarts the app afterwards
   ```
   The script also untars the matching `bizmemory-documents-<date>.tar.gz`
   if present next to the dump.
3. After restore: validate data with the people who reported the incident
   (spot-check affected records before announcing recovery).

## Validation

- Health: `{"status":"ok","db":true}`
- Row counts from the restored DB match the drill numbers
- Login works; one read + one write per core surface (client, invoice)
- An affected user confirms their data is correct
- Audit log tail shows the restore window; note the gap
  (data written between backup time and incident is lost — communicate this)

## Rollback

No verified rollback mechanism found for a restore itself — the damaged-state
snapshot taken in Immediate Actions is the only way back. Keep it until the
incident is formally closed.

## Escalation

Restore decisions are always human decisions. Escalate before:
overwriting live data, choosing between backup versions, or declaring data
permanently unrecoverable. Legal/compliance may apply (audit trail gaps).

## Do Not

- Do not restore over production without `FORCE=1`-style explicit intent —
  the script's guard exists because this is the irreversible action.
- Do not "fix" corrupted rows by hand with SQL while the app is running.
- Do not delete the damaged dump until post-incident review completes.
- Do not run `prisma migrate reset` / `db push --accept-data-loss` here.

## Root Cause Follow-Up

- Confirm the nightly backup cron ran *and* exited 0 for every day since the
  last known-good state (`/var/log/bizmemory-backup.log`).
- Restore drill should be scheduled periodically (DEPLOYMENT.md asks for
  "once, for real" — track it).
- Root-cause the writer of the corruption (deploy, migration, human action)
  via audit log + git history.
