# Cheeky API / Cheeky OS

## Render deploy

- **Root directory:** repository root (or `email-intake` if the service is scoped there; align with `render-http.js` → `email-intake/cheeky-os/server.js`).
- **Build:** `cd email-intake && npm install` (generates Prisma client via `postinstall`).
- **Start:** from repo root, `npm start` runs `node email-intake/cheeky-os/server.js`.

## Environment variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection for Prisma (`email-intake/prisma/schema.prisma`). |
| `PORT` | HTTP port (Render injects). |
| `SQUARE_ACCESS_TOKEN` | Square API (invoices / orders / import). |
| `SQUARE_LOCATION_ID` | Location id for `POST /api/square/import/recent` (Orders API search). |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | Verify `x-square-hmacsha256-signature` on `POST /api/square/webhook`. |
| `SQUARE_WEBHOOK_NOTIFICATION_URL` | Public URL of the webhook (scheme + host + path), e.g. `https://cheeky-api.onrender.com/api/square/webhook`. |
| `SQUARE_WEBHOOK_SIGNATURE_SKIP_VERIFY` | Set to `true` only for local smoke tests (logs a warning). |
| `CHEEKY_OS_FOLLOWUP_CRON` | Set to `true` to enable the optional follow-up cron tick in `followupService`. |

## Square webhooks

- **Canonical:** `POST /api/square/webhook` (raw JSON body; registered in Square Developer dashboard).
- **Mirror:** `POST /webhooks/square/webhook` (same handler).
- **Supplemental (v3.2):** `POST /api/cheeky-webhooks/square` — legacy-style JSON bridge with idempotency; prefer the canonical route for production.

## Cheeky OS v3.2 HTTP (selection)

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/health` | Liveness |
| POST | `/api/orders/quick` | Quick intake |
| POST | `/api/estimates` | Estimate draft |
| POST | `/api/payments/deposit` | Manual deposit + decision engine |
| GET | `/api/operator/top-actions` | Prioritized actions |
| GET | `/api/reports/os/daily` | Revenue at risk + stuck + top actions |
| GET | `/jeremy` | Jeremy execute view |
| GET | `/cheeky-dashboard` | Cheeky front-office view |

Startup log includes: `[CHEEKY-OS v3.2] DECISION ENGINE LIVE`.

## Cheeky OS v3.3 (additive)

| Method | Path | Notes |
|--------|------|--------|
| POST | `/api/square/import/recent` | Pull recent Square orders (last 7 days), skip duplicates by `squareId`, run decision engine |
| POST | `/api/square/import/by-id` | Body: `{ "squareOrderId": "..." }` — import one order |
| POST | `/api/garments/order/:id` | Alias for garment ordered |
| POST | `/api/garments/received/:id` | Alias for garments received |
| POST | `/api/orders/:id/deposit-paid` | Mark deposit + decision engine |
| GET | `/api/reports/daily` | Decision report (revenue at risk, stuck, top actions) — mounted before legacy `/api/reports` |
| GET | `/api/production/queue` | Jeremy + `PRINTING` + garments in + deposit satisfied (v3.3 handler first) |

Cheeky DB remains source of truth; Square is ingest. Order has optional `squareId` for dedupe.

Startup log line: `[CHEEKY-OS v3.3] DECISION ENGINE + SQUARE INGEST LIVE`.
