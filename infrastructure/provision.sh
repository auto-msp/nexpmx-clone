#!/usr/bin/env bash
# BizMemory — Oracle Cloud Ubuntu provisioning (idempotent).
# Safe to re-run: installs what is missing, never overwrites an existing .env.
#
# Usage:
#   sudo DB_PASSWORD='strong-password' DOMAIN=app.yourdomain.com ./infrastructure/provision.sh
#
# Optional env:
#   APP_DIR   (default /opt/bizmemory)
#   DB_USER   (default bizmemory)
#   DB_NAME   (default bizmemory)
#   REPO_URL  (default git@github.com:auto-msp/nexpmx-clone.git)
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/bizmemory}"
DB_USER="${DB_USER:-bizmemory}"
DB_NAME="${DB_NAME:-bizmemory}"
DOMAIN="${DOMAIN:-}"
REPO_URL="${REPO_URL:-git@github.com:auto-msp/nexpmx-clone.git}"
DB_PASSWORD="${DB_PASSWORD:-}"

if [[ $EUID -ne 0 ]]; then
  echo "error: run with sudo" >&2
  exit 2
fi

if [[ -z "$DB_PASSWORD" ]]; then
  echo "error: set DB_PASSWORD, e.g. sudo DB_PASSWORD='…' DOMAIN='…' $0" >&2
  exit 2
fi

echo "==> 1/8 System packages"
apt-get update -qq
apt-get install -y -qq postgresql caddy git curl ca-certificates >/dev/null

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -dv -f2 | cut -d. -f1)" -lt 20 ]]; then
  echo "==> 1b/8 Installing Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi

echo "==> 1c/8 Document storage directory"
install -d -o www-data -g www-data -m 750 /var/lib/bizmemory/documents

echo "==> 2/8 PostgreSQL role + database"
sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';"
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 \
  || sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"

echo "==> 3/8 Application directory + code"
if [[ ! -d "$APP_DIR/.git" ]]; then
  git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"
git pull --ff-only || true

echo "==> 4/8 .env (skipped if it already exists)"
if [[ ! -f "$APP_DIR/.env" ]]; then
  cat > "$APP_DIR/.env" <<ENV
DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@127.0.0.1:5432/$DB_NAME"
AUTH_SECRET="$(openssl rand -base64 32)"
AUTH_GOOGLE_ID="REPLACE-ME"
AUTH_GOOGLE_SECRET="REPLACE-ME"
OWNER_EMAILS="you@yourdomain.com"
AI_PROVIDER="stub"
AUTH_URL="${DOMAIN:-http://localhost:3000}"
ENV
  chmod 600 "$APP_DIR/.env"
  echo "    Created $APP_DIR/.env — EDIT IT: set AUTH_GOOGLE_ID/SECRET and OWNER_EMAILS."
else
  echo "    Existing .env left untouched."
fi

echo "==> 5/8 Dependencies + migrations + build"
npm ci --no-audit --no-fund
npx prisma migrate deploy 2>/dev/null || npx prisma db push --skip-generate
npm run build

echo "==> 6/8 systemd service"
install -m 644 "$APP_DIR/infrastructure/bizmemory.service" /etc/systemd/system/bizmemory.service
id www-data >/dev/null 2>&1 || useradd --system www-data
chown -R www-data:www-data "$APP_DIR"
systemctl daemon-reload
systemctl enable --now bizmemory

echo "==> 7/8 Caddy site"
if [[ -n "$DOMAIN" ]]; then
  sed "s/app.yourdomain.com/$DOMAIN/" "$APP_DIR/infrastructure/Caddyfile" \
    > /etc/caddy/Caddyfile
  systemctl reload caddy || systemctl restart caddy
else
  echo "    DOMAIN not set — Caddyfile not written. Configure TLS manually."
fi

echo "==> 8/8 Firewall (Oracle also needs Security List rules for 80/443)"
if command -v ufw >/dev/null 2>&1; then
  ufw allow 80,443/tcp >/dev/null 2>&1 || true
fi

echo "==> Verifying health"
sleep 3
for i in $(seq 1 10); do
  if curl -fsS http://127.0.0.1:3000/api/health | grep -q '"status":"ok"'; then
    echo "PROVISIONING OK — app healthy on :3000"
    [[ -n "$DOMAIN" ]] && echo "Public URL: https://$DOMAIN (DNS must point at this VM)"
    exit 0
  fi
  sleep 2
done
echo "WARNING: health check did not pass — run: journalctl -u bizmemory -n 50" >&2
exit 1
