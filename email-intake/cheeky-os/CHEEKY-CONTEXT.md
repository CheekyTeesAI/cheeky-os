# Cheeky OS — context (Bundle 1)

## New routes (standalone server)

Run from `email-intake/`:

```bash
node cheeky-os/server.js
```

Default listen: **`0.0.0.0:3001`** (override with `CHEEKY_OS_PORT` only; generic `PORT` is ignored so it does not clash with other apps).

| Method | Path | Notes |
|--------|------|--------|
| GET | `/health` | JSON health for LAN / mobile smoke tests |
| GET | `/revenue/reactivation` | `hot` / `warm` / `cold` buckets (Prisma customers → else Square customers) |
| GET | `/revenue/followups` | `unpaidInvoices` + `staleEstimates` (Square read-only) |
| GET | `/dashboard/today/mobile` | HTML mobile dashboard (inline CSS) |
| (existing) | `/cheeky/*` | Full Cheeky OS router (e.g. `/cheeky/health`) |

## Schema changes

None in this bundle.

## Blocked / caveats

- **`email-intake/` TypeScript server (`voice.run`) is unchanged** — Bundle 1 HTTP entry is **`cheeky-os/server.js`** only. Use port **3001** for curl checks in the superprompt.
- **Reactivation** may return empty `hot`/`warm`/`cold` if marketing Prisma DB has no `Customer` rows and Square customer search returns none (still valid JSON).
- **Unpaid invoices** depend on Square `invoices/search` and `invoice_states`; sandbox accounts may return none while **stale open orders** still populate.
- **Stale “estimates”** are implemented as **Square `orders/search` with state `OPEN`** and `created_at` older than 5 days (read-only proxy for stale quotes).

## Files added (Bundle 1)

- `cheeky-os/server.js`
- `cheeky-os/routes/revenue.js`
- `cheeky-os/routes/mobileDashboard.js`
- `cheeky-os/services/reactivationBuckets.js`
- `cheeky-os/services/revenueFollowups.js`
- `cheeky-os/CHEEKY-CONTEXT.md`

## Integration tweak

- `cheeky-os/integrations/square.js` — exports `getBaseUrl` for revenue services (additive).
