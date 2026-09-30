#!/usr/bin/env bash
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
