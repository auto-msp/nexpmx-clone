#!/usr/bin/env bash
# Documents restore: untar the matching documents archive if present.
# BizMemory — restore drill / actual restore.
# Restores a .dump into a TARGET database (default: bizmemory_restore) so a
# drill never touches production. Set TARGET=bizmemory FORCE=1 to restore over
# the live database deliberately.
#
# Usage:
#   sudo ./infrastructure/restore.sh /var/backups/bizmemory-2026-09-30.dump
#   sudo TARGET=bizmemory FORCE=1 ./infrastructure/restore.sh dump-file      # live overwrite
set -euo pipefail

DUMP="${1:-}"
TARGET="${TARGET:-bizmemory_restore}"
FORCE="${FORCE:-0}"

if [[ -z "$DUMP" || ! -f "$DUMP" ]]; then
  echo "usage: $0 <path-to-.dump>   (TARGET=bizmemory FORCE=1 for live overwrite)" >&2
  exit 2
fi

if [[ "$TARGET" == "bizmemory" && "$FORCE" != "1" ]]; then
  echo "refusing to overwrite the live database without TARGET=bizmemory FORCE=1" >&2
  exit 2
fi

sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$TARGET'" | grep -q 1 \
  || sudo -u postgres createdb -T template0 "$TARGET"

echo "==> Restoring $DUMP into '$TARGET'"
sudo -u postgres pg_restore --clean --if-exists --no-owner -d "$TARGET" "$DUMP"

# Documents live on disk, not in the dump — restore the matching archive
# (bizmemory-documents-<date>.tar.gz next to the dump) when present.
DOC_DIR="${DOCUMENT_STORAGE_DIR:-/var/lib/bizmemory/documents}"
DOC_TAR="${DUMP%.dump}-documents.tar.gz"
if [[ -f "$DOC_TAR" ]]; then
  echo "==> Restoring documents from $(basename "$DOC_TAR")"
  mkdir -p "$(dirname "$DOC_DIR")"
  tar -xzf "$DOC_TAR" -C "$(dirname "$DOC_DIR")"
else
  echo "==> No documents archive next to the dump — skipping file restore"
fi

echo "==> Verifying restore (row counts of core tables)"
sudo -u postgres psql -d "$TARGET" -c "
  SELECT 'users' t, count(*) FROM \"User\"
  UNION ALL SELECT 'clients', count(*) FROM \"Client\"
  UNION ALL SELECT 'projects', count(*) FROM \"Project\"
  UNION ALL SELECT 'invoices', count(*) FROM \"Invoice\"
  UNION ALL SELECT 'decisions', count(*) FROM \"Decision\";"

if [[ "$TARGET" == "bizmemory" ]]; then
  echo "Live database restored — restarting the app"
  systemctl restart bizmemory
else
  echo "Drill complete. When satisfied, drop the scratch DB:"
  echo "  sudo -u postgres dropdb $TARGET"
fi
