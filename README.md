# BizMemory

A clean-room reconstruction of a **Business Memory Platform** SaaS: one
connected system where clients, projects, tasks, invoices and decisions feed
an AI assistant that answers questions from your own business memory.

> **Provenance notice.** This repository reconstructs the *functionality and
> architecture* of a publicly documented product category, from public
> evidence. It contains **no copied source code, copyrighted text, branded
> assets, or claimed affiliation** with any similar product. Branding, copy,
> and prices in this repo are original.

## Quickstart

```bash
cp .env.example .env          # fill in real values
npm install
npx prisma db push            # or: npm run db:migrate
npm run dev                   # http://localhost:3000
```

Google OAuth: create credentials at console.cloud.google.com → OAuth client,
with redirect URI `http://localhost:3000/api/auth/callback/google`.

Run checks:

```bash
npm run typecheck
npm test
npm run test:e2e   # Playwright: needs `npm run build` first (runs `npm run start`)
npm run build
curl localhost:3000/api/health
```

## What is implemented

| Area | Status |
| --- | --- |
| Marketing site (home, client-portal solution, pricing, intelligence, legal) | ✅ |
| Google OAuth sign-in (Auth.js v5, DB sessions), login-redirect gate | ✅ |
| Dashboard (stats, credits, recent decisions) | ✅ |
| Clients CRUD + plan entitlement caps | ✅ |
| Projects + 3-column task board | ✅ |
| Invoices with explicit status state machine | ✅ |
| Decisions log | ✅ |
| AI Assistant (grounded, provider-agnostic adapter, credit metering) | ✅ |
| Token-authenticated read-only Client Portal | ✅ |
| REST API v1 with hashed API keys | ✅ |
| RBAC matrix, audit log, security headers, rate limiting | ✅ |
| Tests (unit, integration, Playwright E2E), typecheck, production build | ✅ |
| Billing (Razorpay orders + signed webhooks) + self-serve /billing checkout | ✅ |

Not yet implemented: automations runner, multi-org switching, live
processor keys/KYC, counsel-reviewed legal pages. See
`docs/KNOWN_LIMITATIONS.md`.

## Documentation

| Doc | Contents |
| --- | --- |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System layers, request flows |
| [SITEMAP.md](docs/SITEMAP.md) | Route inventory with provenance/confidence |
| [BACKEND.md](docs/BACKEND.md) | Actions, API, AI adapter |
| [DATABASE.md](docs/DATABASE.md) | Data model + ERD + provenance |
| [AUTHENTICATION.md](docs/AUTHENTICATION.md) | OAuth, sessions, lifecycle |
| [AUTHORIZATION.md](docs/AUTHORIZATION.md) | RBAC matrix |
| [SECURITY.md](docs/SECURITY.md) | Controls, threat model, security report |
| [BUSINESS_RULES.md](docs/BUSINESS_RULES.md) | Rule IDs with evidence |
| [DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) | Tokens, components |
| [API.md](docs/API.md) | Endpoint reference |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Oracle Cloud Ubuntu + Caddy + systemd |
| [OBSERVABILITY.md](docs/OBSERVABILITY.md) | Health, audit, logging |
| [TESTING.md](docs/TESTING.md) | Test strategy |
| [KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md) | What is missing and why |
| [ASSUMPTIONS.md](docs/ASSUMPTIONS.md) | Inferred/assumed decisions |
| [DECISIONS.md](docs/DECISIONS.md) | ADRs |
| [REVERSE_ENGINEERING.md](docs/REVERSE_ENGINEERING.md) | Evidence & confidence register |

## Deployment (Oracle Cloud)

```bash
sudo apt install -y postgresql caddy
sudo -u postgres createdb bizmemory
sudo ./infrastructure/deploy.sh   # see docs/DEPLOYMENT.md for prerequisites
```

Caddy terminates TLS and reverse-proxies to the Node service managed by
systemd. Full runbook: `docs/DEPLOYMENT.md`.
