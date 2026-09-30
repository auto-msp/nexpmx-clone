#!/usr/bin/env bash
# BizMemory — nightly database backup with retention.
# Install as: /etc/cron.d/bizmemory-backup  (see docs/DEPLOYMENT.md §Backups)
#   0 2 * * * root /opt/bizmemory/infrastructure/backup.sh
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
DB_NAME="${DB_NAME:-bizmemory}"
STAMP="$(date +%F)"
OUT="$BACKUP_DIR/bizmemory-$STAMP.dump"

install -d -m 700 "$BACKUP_DIR"

# -Fc custom format: compressed, supports selective restore.
sudo -u postgres pg_dump -Fc "$DB_NAME" > "$OUT"

# Refuse to keep an empty/corrupt dump: pg_dump failure is caught by -e,
# so a zero-byte file would only appear from disk issues.
if [[ ! -s "$OUT" ]]; then
  echo "backup produced an empty dump: $OUT" >&2
  exit 1
fi

find "$BACKUP_DIR" -name 'bizmemory-*.dump' -mtime "+$RETENTION_DAYS" -delete

echo "backup OK: $OUT ($(du -h "$OUT" | cut -f1))"
