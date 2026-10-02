# DOMAIN SETUP — subdomain deployment with Google Auth

This guide takes you from "app builds" to "sign in with Google on a real
HTTPS subdomain". Assumes the Oracle VM from `docs/DEPLOYMENT.md`.

## 0. Recommended hostname

**`app.nexpmx.com`**

Reasoning (short, honest):

- `app.` is the strongest, most conventional signal for "the product" —
  `app.notion.so`, `app.razorpay.com`, `app.zoho.in`. Marketing site can later
  live at the apex (`nexpmx.com`) with zero conflicts.
- Short, typeable, dictates well in writing and on calls.
- One A record now (`app`), and the apex stays free for a future website
  without DNS surgery.
- Avoid `www.` (reads like a brochure site), avoid `saas.` / `platform.`
  (non-standard, harder to say aloud).

Alternatives if you prefer: `bizmemory.nexpmx.com` (product-named) or
`console.nexpmx.com` (dashboards-y). Everything below works identically —
substitute the hostname.

## 1. DNS — the A record

On your DNS provider (Cloudflare, Namecheap, Oracle DNS, …):

| Type | Host | Value | TTL | Proxy |
| --- | --- | --- | --- | --- |
| A | `app` | `<VM public IP>` | 300–3600 | **DNS only** (grey cloud) |

Checks:

```bash
dig +short app.nexpmx.com A    # → your VM IP
```

**If you use Cloudflare/other proxy:** set it to *DNS only* while issuing the
first TLS certificate. Caddy needs port 80/443 reachable directly for the
ACME HTTP-01 challenge. You can re-enable the proxy afterwards (Caddy's TLS
renewals use `tls-01` over 443 — keep 80 open anyway, it costs nothing).

Do **not** add a CNAME unless you're on a managed DNS that requires it — an
apex-of-subdomain A record is the simple, correct shape here.

## 2. Oracle Cloud security list + firewall

Both must allow 80 + 443:

- Security List (VCN → Subnet → Security List): ingress TCP 80, 443 from
  `0.0.0.0/0`.
- On the VM: `sudo ufw allow 80,443/tcp` (the provision script does this).

## 3. Caddyfile

`/etc/caddy/Caddyfile`:

```
app.nexpmx.com {
    encode gzip
    reverse_proxy 127.0.0.1:3000
    header {
        Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
    }
}
```

```bash
sudo systemctl reload caddy
```

Caddy obtains the Let's Encrypt certificate automatically on first request —
watch it with `sudo journalctl -u caddy -f`. First load may take ~10 seconds
while the cert issues.

## 4. Google OAuth — exactly what to click

1. <https://console.cloud.google.com> → (pick or create project) →
   **APIs & Services → OAuth consent screen**
   - User type: **External** (or Internal if you have Workspace and want
     org-only).
   - App name: `BizMemory` · support email: you · developer contact: you.
   - Scopes: keep **default** (`.../auth/userinfo.email`,
     `.../auth/userinfo.profile`, `openid`) — the app requests nothing else.
   - Save. While in *Testing* mode, add your own Google account under
     **Test users** — that's enough to sign in.

2. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: **Web application**
   - **Authorized JavaScript origins:**
     - `https://app.nexpmx.com`
   - **Authorized redirect URIs:** *(exact, no trailing slash)*
     - `https://app.nexpmx.com/api/auth/callback/google`
   - Create → copy the **Client ID** and **Client secret**.

3. VM `.env` (`/opt/bizmemory/.env`):

```
AUTH_URL="https://app.nexpmx.com"
AUTH_GOOGLE_ID="<client id>"
AUTH_GOOGLE_SECRET="<client secret>"
OWNER_EMAILS="you@yourdomain.com"
```

```bash
sudo systemctl restart bizmemory
```

> **Why AUTH_URL matters:** Auth.js derives the OAuth redirect origin and
> session cookie flags from it. Set it to the exact scheme+host or sign-in
> will loop back to `/login` with a redirect_uri mismatch.

Multiple environments: add **one more redirect URI per environment** to the
same client (e.g. `http://localhost:3000/api/auth/callback/google` for dev) —
Google allows up to 100; no need for a second project.

## 5. First sign-in

Visit `https://app.nexpmx.com` → Continue with Google → approve.

Whoever's email is in `OWNER_EMAILS` gets the OWNER role; every other
sign-in creates MEMBER. The workspace + 14-day TRIALING subscription are
bootstrapped automatically on first login — **no seed data exists and none
is needed.**

## 6. Email sending on your domain (Resend)

The app sends invites/notifications via Resend (`RESEND_API_KEY`). To send
as `invites@nexpmx.com` instead of the onboarding address:

1. Create a key at <https://resend.com/api-keys> → put it in `.env` as
   `RESEND_API_KEY`.
2. <https://resend.com/domains> → **Add domain** → `nexpmx.com` → Resend
   shows DNS records (DKIM: 2–3 TXT/CNAME records, SPF include, optional
   DMARC TXT). Add them at your DNS provider.
3. Wait for verification (usually minutes) → set in `.env`:

```
MAIL_FROM_ADDRESS="invites@nexpmx.com"
MAIL_FROM_NAME="BizMemory"
```

Restart. Test instantly from the app: Settings → Team → invite your own
address — you'll get the email and the one-time link still appears in the UI
(delivery failure can never block onboarding).

**Without a key:** the app runs exactly as before (logs the email intent,
shows the link). Nothing breaks in dev/CI.

## 7. Razorpay webhook (when you enable checkout)

Dashboard → Settings → Webhooks:

- URL: `https://app.nexpmx.com/api/webhooks/razorpay`
- Secret: same value as `RAZORPAY_WEBHOOK_SECRET` in `.env`
- Events: `payment.captured`, `order.paid`, `payment.failed`,
  `subscription.charged`, `subscription.activated`

## 8. Verify the whole chain

```bash
# DNS + TLS
curl -sI https://app.nexpmx.com | head -3          # HTTP/2 200 (or 307)
# health
curl -s https://app.nexpmx.com/api/health           # {"status":"ok","db":true}
# auth gate (protected route must bounce to /login)
curl -s -o /dev/null -w '%{http_code}\n' https://app.nexpmx.com/dashboard   # 307
# login page renders
curl -s https://app.nexpmx.com/login | grep -o 'Continue with Google' | head -1
```

Then in a browser: sign in → land on Home → invite a teammate → the invite
email arrives from your domain.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `redirect_uri_mismatch` at Google | redirect URI or AUTH_URL wrong | exact match incl. scheme/host; restart after .env change |
| Cert never issues | 80/443 blocked, or proxy (orange cloud) on | open ports; set DNS-only during first issue |
| Sign-in loops to /login | session cookie Secure but served over http | AUTH_URL must be `https://…` in prod |
| Invite email 403 from Resend | `from` domain not verified | verify domain (§6) or keep onboarding address |
| 502 from Caddy | app not running | `sudo systemctl status bizmemory`, check `journalctl -u bizmemory -n 50` |
