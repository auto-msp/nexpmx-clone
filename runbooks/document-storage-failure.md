# Incident: Document storage failing (uploads/downloads broken)

## Purpose

The Document Hub cannot store or serve files: disk full, permissions broken
after a provisioning change, or blobs missing on disk while DB rows exist.

## Impact

Uploads fail with a generic error; downloads return `404 {"error":"File
missing from storage"}`. Document metadata (titles, links) still shows — it
lives in Postgres. Portal document sharing is affected too. No other feature
touches the file store.

## Symptoms

- Upload throws "Could not store the file. Please try again." and
  `journalctl -u bizmemory` shows `[documents] storage put failed`
- Download returns 404 with "File missing from storage" for a document that
  exists in the list
- `df -h` shows the volume holding `DOCUMENT_STORAGE_DIR` (default
  `/var/lib/bizmemory/documents`) full
- `systemctl status bizmemory` shows the unit failing to start after
  permission changes (ReadWritePaths violation)

## Severity

P1 (feature outage; no data corruption — writes are all-or-nothing per file).

## Immediate Actions

1. Check the disk:
   ```bash
   df -h /var/lib/bizmemory
   ```
2. Check the directory exists with correct ownership (provision.sh creates
   `750 www-data:www-data`):
   ```bash
   ls -la /var/lib/bizmemory/documents
   ```
3. Confirm the systemd unit allows writes there (`ReadWritePaths` in
   `/etc/systemd/system/bizmemory.service` must include
   `/var/lib/bizmemory/documents`; the repo copy
   `infrastructure/bizmemory.service` is the reference).
4. Check `DOCUMENT_STORAGE_DIR` in `/opt/bizmemory/.env` matches where files
   actually are (a mismatch makes existing files unreachable — 404s — even
   though nothing is lost).

## Diagnosis

```bash
sudo -u www-data touch /var/lib/bizmemory/documents/.wtest && \
  sudo -u www-data rm /var/lib/bizmemory/documents/.wtest   # write permission
find /var/lib/bizmemory/documents -type f | wc -l            # file count vs DB rows
sudo -u postgres psql bizmemory -tAc \
  'SELECT count(*) FROM "Document";'                          # metadata rows
journalctl -u bizmemory -n 100 --no-pager | grep -E 'documents|download'
```

- File count ≪ DB rows → blobs were deleted/moved (recover: restore the
  documents tarball per `data-recovery.md`).
- Writes fail only for the app user → ownership or ReadWritePaths problem.
- Every upload fails after a deploy → check the new release still points at
  the same `DOCUMENT_STORAGE_DIR`.

## Recovery

- **Disk full**: free space (old backup tarballs in `/var/backups` are the
  usual culprit), then retry the upload. Uploads reject cleanly before
  writing when the plan cap is hit, but a full *disk* still fails at
  `storage.put`.
- **Permissions**: `sudo chown -R www-data:www-data /var/lib/bizmemory/documents`
  then `sudo systemctl restart bizmemory`.
- **Missing blobs after VM restore**: restore the matching
  `bizmemory-documents-<date>.tar.gz` — REQUIRES HUMAN APPROVAL, see
  `data-recovery.md`.

## Validation

- Upload a test file via the app (Settings → role with `document:write`).
- Download it; verify byte-identical content and `Content-Type` matches.
- Confirm an audit `document.uploaded` + `document.downloaded` pair appears
  in Settings → Recent audit log.

## Rollback

No verified rollback mechanism found (storage is additive files; there is no
in-repo snapshot mechanism beyond the nightly tarball).

## Escalation

Escalate when DB rows and disk files have diverged significantly — the
repair (delete orphan rows vs re-upload) is a human decision per document.

## Do Not

- Do not hand-delete files under `DOCUMENT_STORAGE_DIR` to "clean up" —
  every file corresponds to a `Document` row with an audit trail.
- Do not change `DOCUMENT_STORAGE_DIR` without a migration plan for existing
  files (they become unreachable, not lost).
- Do not widen ReadWritePaths beyond the documents dir.

## Root Cause Follow-Up

- If disk-full recurs, add disk alerting (OBSERVABILITY.md recommends
  alert at 80%).
- Downloads buffer whole files in memory (25 MB cap bounds it); track
  streaming improvement in KNOWN_LIMITATIONS #15.
