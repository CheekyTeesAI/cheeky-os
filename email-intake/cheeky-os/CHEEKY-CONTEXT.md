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
| GET | `/revenue/followups` | `unpaidInvoices` + `staleEstimates` with `customerId`, `customerName`, `phone`, `email` (Square batch-retrieve, max 15 rows / 15 customer IDs) |
| GET | `/dashboard/today/mobile` | HTML sales-first mobile dashboard (next action, scripts, tap Call/Email) |
| GET | `/system/health` | Same JSON as `/health` (Bundle 2 checklist) |
| GET | `/dashboard/next-action` | One recommended sales action (followups + reactivation) |
| POST | `/square/create-draft-invoice` | Create Square invoice draft only (`SHARE_MANUALLY`, not published/sent) |
| GET | `/revenue/scripts` | Static outreach message templates (JSON) |
| GET | `/sales/command-center` | Bundle 2.5 — combined next action, top 5 lists, script set (one followups + one reactivation fetch) |
| (existing) | `/cheeky/*` | Full Cheeky OS router (e.g. `/cheeky/health`) |

## Schema changes

None in this bundle.

## Blocked / caveats

- **`email-intake/` TypeScript server (`voice.run`) is unchanged** — Bundle 1 HTTP entry is **`cheeky-os/server.js`** only. Use port **3001** for curl checks in the superprompt.
- **Reactivation** may return empty `hot`/`warm`/`cold` if marketing Prisma DB has no `Customer` rows and Square customer search returns none (still valid JSON).
- **Unpaid invoices** depend on Square `invoices/search` and `invoice_states`; sandbox accounts may return none while **stale open orders** still populate.
- **Stale “estimates”** are implemented as **Square `orders/search` with state `OPEN`** and `created_at` older than 5 days (read-only proxy for stale quotes).

## Files added (Bundle 1 + 2)

- `cheeky-os/server.js`
- `cheeky-os/routes/revenue.js` (Bundle 2: `/scripts`)
- `cheeky-os/routes/mobileDashboard.js`
- `cheeky-os/routes/dashboardNext.js` (Bundle 2)
- `cheeky-os/routes/squareDraft.js` (Bundle 2)
- `cheeky-os/services/reactivationBuckets.js`
- `cheeky-os/services/revenueFollowups.js`
- `cheeky-os/services/nextAction.js` (Bundle 2)
- `cheeky-os/services/squareDraftInvoice.js` (Bundle 2)
- `cheeky-os/services/scriptTemplates.js` (Bundle 2.5)
- `cheeky-os/routes/sales.js` (Bundle 2.5)
- `cheeky-os/CHEEKY-CONTEXT.md`

## Integration tweak

- `cheeky-os/integrations/square.js` — exports `getBaseUrl` for revenue services (additive).
