#!/usr/bin/env bash
# BizMemory deploy — Oracle Cloud Ubuntu.
# Pulls latest, installs, migrates, builds, restarts, verifies health.
# Usage: sudo ./infrastructure/deploy.sh
set -euo pipefail

APP_DIR="/opt/bizmemory"
SERVICE="bizmemory"
HEALTH_URL="http://127.0.0.1:3000/api/health"

cd "$APP_DIR"

echo "==> Pulling latest code"
git pull --ff-only

echo "==> Installing dependencies"
npm ci --no-audit --no-fund

echo "==> Applying database migrations"
# npm may block lifecycle scripts; generate the client explicitly.
npx prisma generate
npx prisma migrate deploy
npx prisma migrate status

echo "==> Building"
npm run build

echo "==> Restarting service"
systemctl restart "$SERVICE"
sleep 3

echo "==> Verifying health"
for i in $(seq 1 10); do
  if curl -fsS "$HEALTH_URL" | grep -q '"status":"ok"'; then
    echo "Deploy OK: $HEALTH_URL healthy."
    exit 0
  fi
  sleep 2
done

echo "Deploy FAILED: health check did not pass. Check: journalctl -u $SERVICE -n 100" >&2
exit 1
