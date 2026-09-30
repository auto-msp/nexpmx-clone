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
```

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

## 7. Deploy script

`infrastructure/deploy.sh` automates steps 4–5 for updates (pull → migrate →
build → restart, with health verification and rollback-on-failure of the
service start).

## Environments

| Env | DB | Secrets | Notes |
| --- | --- | --- | --- |
| dev | local docker (5433) | dummy | this repo's smoke setup |
| staging | separate DB on VM | real, separate | recommended before prod |
| prod | `/opt/bizmemory` DB | real | `OWNER_EMAILS` must list real owners |

## Backups

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
