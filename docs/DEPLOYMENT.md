# DEPLOYMENT — Oracle Cloud Ubuntu

Target: single VM (Ampere A1 or x86), Ubuntu 22.04/24.04, Caddy on :443,
Node app on :3000 (loopback), PostgreSQL local.

## 1. Prerequisites

```bash
sudo apt update && sudo apt install -y postgresql caddy git
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
```

Oracle Cloud security list: open TCP 80 + 443. Also `sudo ufw allow 80,443/tcp`.

## 2. Database

```bash
sudo -u postgres psql <<'SQL'
CREATE USER bizmemory WITH PASSWORD 'SET-A-STRONG-PASSWORD';
CREATE DATABASE bizmemory OWNER bizmemory;
SQL
```

## 3. Application

```bash
sudo mkdir -p /opt/bizmemory && sudo chown $USER /opt/bizmemory
git clone <your-repo-url> /opt/bizmemory && cd /opt/bizmemory
npm ci
```

Create `/opt/bizmemory/.env` (never commit it):

```
DATABASE_URL="postgresql://bizmemory:STRONG-PASSWORD@127.0.0.1:5432/bizmemory"
AUTH_SECRET="$(openssl rand -base64 32)"
AUTH_GOOGLE_ID="…"
AUTH_GOOGLE_SECRET="…"
OWNER_EMAILS="you@yourdomain.com"
AI_PROVIDER="stub"
AUTH_URL="https://app.yourdomain.com"
DOCUMENT_STORAGE_DIR="/var/lib/bizmemory/documents"
RAZORPAY_KEY_ID="…"          # optional; absent = checkout in contact-us mode
RAZORPAY_KEY_SECRET="…"      # server-only
RAZORPAY_WEBHOOK_SECRET="…"  # must match the Razorpay dashboard webhook config
```

Razorpay webhook (ADR-017): point it at
`https://app.yourdomain.com/api/webhooks/razorpay`, events
`payment.captured`, `order.paid`, `payment.failed`,
`subscription.charged`, `subscription.activated`; set the same secret in
both places. Rotating it: dashboard first, then `.env`, then restart.

Google OAuth redirect URI: `https://app.yourdomain.com/api/auth/callback/google`.

## 4. Migrate + build

```bash
cd /opt/bizmemory
npx prisma migrate deploy   # or: npx prisma db push for first boot
npm run build
```

## 5. systemd service

`/etc/systemd/system/bizmemory.service` (also in `infrastructure/`):

```ini
[Unit]
Description=BizMemory web app
After=network.target postgresql.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/bizmemory
EnvironmentFile=/opt/bizmemory/.env
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=3
# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/bizmemory/.next /opt/bizmemory/.prisma
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo chown -R www-data:www-data /opt/bizmemory
sudo systemctl daemon-reload && sudo systemctl enable --now bizmemory
```

## 6. Caddy (automatic TLS)

`/etc/caddy/Caddyfile` (also in `infrastructure/`):

```
app.yourdomain.com {
    encode gzip
    reverse_proxy 127.0.0.1:3000
    header {
        Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
    }
}
```

```bash
sudo systemctl reload caddy
```

## 7. Scripts (all idempotent, all syntax-checked)

| Script | Purpose |
| --- | --- |
| `infrastructure/provision.sh` | One-shot VM provisioning: packages, DB, code, `.env` (never overwrites), build, systemd, Caddy, firewall, health gate |
| `infrastructure/deploy.sh` | App updates: pull → migrate → build → restart → health-gate |
| `infrastructure/backup.sh` | Nightly `pg_dump -Fc` with retention cleanup (cron) |
| `infrastructure/restore.sh` | Restore **drill** into a scratch DB by default; live overwrite requires `TARGET=bizmemory FORCE=1` |

### Fast path (fresh Ubuntu VM)

```bash
sudo DB_PASSWORD='strong-password' DOMAIN=app.yourdomain.com \
  ./infrastructure/provision.sh
# then edit /opt/bizmemory/.env (Google OAuth creds, OWNER_EMAILS) and:
sudo systemctl restart bizmemory
```

### Backup cron

```bash
# /etc/cron.d/bizmemory-backup
0 2 * * * root /opt/bizmemory/infrastructure/backup.sh >> /var/log/bizmemory-backup.log 2>&1
```

## Environments

| Env | DB | Secrets | Notes |
| --- | --- | --- | --- |
| dev | local docker (5433) | dummy | this repo's smoke setup |
| staging | separate DB on VM | real, separate | recommended before prod |
| prod | `/opt/bizmemory` DB | real | `OWNER_EMAILS` must list real owners |

## Deploying to a shared host (2026-10-02, verified on perceptor)

The single-VM layout above assumes the machine is dedicated to BizMemory. On a
host already running other services, several defaults are wrong and were hit
in practice:

- **Port 3000 was already taken.** Pick a free port (3100 was used) and set
  `Environment=PORT=` in the unit. `infrastructure/bizmemory.service` reads
  3000 as an overridable default.
- **Caddy may be containerised** and already reverse-proxying other domains
  from a hand-maintained file. `provision.sh` now refuses to overwrite an
  existing `/etc/caddy/Caddyfile`. Add a site block by hand instead.
- **A containerised Caddy cannot reach `127.0.0.1:<port>`** — that is the
  container's own loopback. Use the Docker bridge gateway address (what
  `docker network inspect <net> -f '{{.Gateway}}'` reports, e.g.
  `172.18.0.1`), matching the other vhosts.
- **ufw must allow that port from the bridge subnet.** Traffic from the
  container arrives on the bridge address, not loopback, and ufw's default is
  `deny (incoming)`:
  ```bash
  sudo ufw allow from 172.18.0.0/16 to 172.18.0.1 port 3100 proto tcp
  ```
- **Single-file bind mounts cache the inode.** `sed -i` replaces the file, so
  the container keeps serving the old contents and `caddy reload` reports
  `config is unchanged` — a silent no-op. Recreate the container to pick it up:
  ```bash
  cd /root/n8n-docker-caddy && docker compose up -d --force-recreate caddy
  ```
- **Proxied DNS breaks ACME.** With a Cloudflare (or any) proxy on the record,
  the HTTP-01 challenge never reaches the origin and the host cannot obtain a
  certificate — Cloudflare returns `525 SSL_HANDSHAKE_FAILED`. Either set the
  record to DNS-only so Caddy can issue normally, or supply a Cloudflare
  Origin CA certificate covering the hostname (precedent: the
  `voice.automsp.store` vhost). ACME and a proxy are mutually exclusive here.
- **Don't use bare `SELECT 1` as a health gate.** `/api/health` also asserts
  `Organization` and `User` exist, so a database with no applied schema fails
  the gate instead of reporting `ok`.

Verified live at `https://app.coreitx.us.kg` on perceptor (132.145.133.39):
Let's Encrypt cert issued, `/api/health` → `{"status":"ok","db":true}`,
`/dashboard` → 307 to `/login`, and the seven pre-existing vhosts still
serving after the change.

## Backups

Documents uploaded to the Document Hub live under `DOCUMENT_STORAGE_DIR`
(default `/var/lib/bizmemory/documents`), outside Postgres.
`infrastructure/backup.sh` archives that directory as
`bizmemory-documents-<date>.tar.gz` next to the nightly DB dump, and
`infrastructure/restore.sh` restores the matching archive automatically.
Provisioning creates the directory with `750 www-data:www-data` ownership,
and the systemd unit's `ReadWritePaths` includes it.

```bash
# /etc/cron.d/bizmemory-backup — nightly dump, retained 14 days
0 2 * * * postgres pg_dump -Fc bizmemory > /var/backups/bizmemory-$(date +\%F).dump
0 3 * * * find /var/backups -name 'bizmemory-*.dump' -mtime +14 -delete
```

Restore drill (do it once, for real):

```bash
createdb -T template0 bizmemory_restore && pg_restore -d bizmemory_restore /var/backups/bizmemory-YYYY-MM-DD.dump
```

Also enable Oracle Cloud block-volume backups for the boot volume.

## Health & monitoring

- `GET /api/health` → wire to uptime monitoring (status page / cron alert).
- `journalctl -u bizmemory -f` for app logs.
- Exit codes: systemd restarts after 3s on failure.
