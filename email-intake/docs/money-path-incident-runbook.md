# Cheeky OS Money-Path Incident Runbook

Scope: **Square invoice/payment webhooks**, order payment state, idempotency, and signature verification.  
Primary API: `src/api/voice.run.ts`. Secondary bundle: `cheeky-os/server.js` (different port/host possible).

---

## 1. When to Use This

Use this runbook when:

- **Webhook failure** — Square retries or errors; events not reaching the app.
- **Signature failure** — `401` / “Invalid Square webhook signature” / missing header messages.
- **Payment not reflected** — Square shows paid/settled but `Order` fields (`amountPaid`, status, etc.) do not match.
- **Duplicate processing suspicion** — duplicate tasks, double state changes, same `event_id` processed twice.
- **Health OK, money path broken** — `GET /health` returns 200 but webhooks or DB updates fail.

This document does **not** cover outreach email, social cron, or dashboard-specific flows unless they touch the same env/DB.

---

## 2. Immediate Triage (order to run)

1. **`GET /health`** on the process that should receive Square (main API: path `/health`; cheeky-os: `/health` or `/healthz`). Expect **200**.
2. **`npm run smoke:test`** (or `npm run release:verify`) with **`SMOKE_BASE_URL`** pointing at that process. From repo root `email-intake/`. Confirms routing + signature policy vs local env (see `scripts/smoke-test.js` header).
3. **Confirm which URL Square is calling** — must match the process you are debugging:
   - **Canonical invoice/payment pipeline:** `POST /api/square/webhook` (raw body + HMAC in `src/routes/squareWebhook.ts`).
   - **Legacy payment-only (e.g. `payment.completed`):** `POST /webhooks/square` — `src/routes/square.webhook.ts` (`handleSquarePaymentWebhook`), not the full invoice pipeline.
   - **Legacy raw (different behavior):** `POST /cheeky/webhooks/square` — `src/api/webhooks.square.ts` (do not confuse with canonical).
   - **cheeky-os:** also serves `POST /api/square/webhook` and `POST /webhooks/square/webhook` via `src/webhooks/squareWebhook.js` (loads **`dist/`** services — build must exist).
4. **Env for signature verification** (same host/process as the webhook):
   - `SQUARE_WEBHOOK_SIGNATURE_KEY` — if set, verification is enforced (unless skip).
   - `SQUARE_WEBHOOK_NOTIFICATION_URL` — must match Square’s subscribed URL **exactly** (scheme, host, path, no query) when the key is set; otherwise computed from request headers (often wrong behind proxies).
   - `SQUARE_WEBHOOK_SIGNATURE_SKIP_VERIFY=true` — **dev only**; skips HMAC (logged once).
5. **Scheduler** — `ENABLE_SCHEDULER` affects command-layer **hourly/daily** jobs in `voice.run.ts`, **not** Square webhook delivery. Treat as unrelated unless the incident is specifically about scheduled command-layer behavior.

---

## 3. Symptom → Likely Cause

| Symptom | Likely cause | Where to look |
|--------|----------------|---------------|
| **401** on `POST /api/square/webhook` | HMAC mismatch, missing `x-square-hmacsha256-signature`, or wrong `SQUARE_WEBHOOK_NOTIFICATION_URL` | Env on webhook process; Square Dashboard subscription URL vs actual public URL |
| **500** with message about `SQUARE_WEBHOOK_NOTIFICATION_URL` | Key set but notification URL empty and headers did not yield a usable URL | Set `SQUARE_WEBHOOK_NOTIFICATION_URL` explicitly |
| **200** response but `success: false` / “No matching order” | Payload has no invoice/order/invoice-number match in DB | `squareWebhookService` order lookup; ensure `Order.squareInvoiceId`, `squareOrderId`, or `squareInvoiceNumber` populated |
| **200** and “already processed” | Idempotency: same `event_id` stored in `ProcessedWebhookEvent` | Expected on Square retries; not a failure |
| Health **200** but orders not updating | Wrong server/port, wrong route, DB connectivity, or handler error after verify | Process logs; `DATABASE_URL`; confirm canonical path hits `processSquareWebhook` |
| Duplicates / double tasks | Same event hitting **different** routes (e.g. legacy + canonical) with different handlers; or idempotency bypass | Ensure Square points to **one** money pipeline URL; check `ProcessedWebhookEvent` / `event_id` |
| Works on **voice.run** but not **cheeky-os** (or reverse) | Two processes: different mounts, cheeky-os needs **`npm run build`** for `dist/` bridge | `cheeky-os/server.js` + `src/webhooks/squareWebhook.js` |

---

## 4. Recovery Steps

1. **Align Square Dashboard** subscription URL with **`POST https://<host>/api/square/webhook`** on the process you intend (or documented legacy URL if deliberately used).
2. **Set `SQUARE_WEBHOOK_NOTIFICATION_URL`** to that exact URL if verification is on and headers/proxy are unreliable.
3. **Re-run smoke** — `SMOKE_BASE_URL=https://your-host npm run smoke:test` (or local).
4. **Temporary mitigation (non-production only):** `SQUARE_WEBHOOK_SIGNATURE_SKIP_VERIFY=true` to confirm pipeline vs signature — **remove immediately** after diagnosis.
5. **Rollback trigger:** If a deploy introduced wrong middleware order (JSON before raw on canonical path), **revert deploy** — canonical path requires **raw body before `express.json()`** for byte-exact HMAC (`voice.run.ts` mounts this explicitly).
6. **Do not** toggle random env vars on production without understanding impact; prefer fixing URL/key alignment.

---

## 5. Manual Fallback Procedure

When automation is degraded but payments are happening in Square:

1. **Record** Square payment id, order id, invoice id, customer email, amount, and **Square `event_id`** if visible in logs/dashboard.
2. In the database / admin tools you already use, **find the `Order`** by `squarePaymentId`, `squareOrderId`, or `squareInvoiceId` — avoid creating a **second** order for the same payment.
3. **Do not** replay webhook payloads manually into production without understanding idempotency — `ProcessedWebhookEvent` keys on `event_id`; duplicate inserts may be ignored or conflict.
4. **Document** what should be corrected (amount, status) for a **follow-up** fix or support ticket; prefer Square’s dashboard + internal reconciliation over double-submitting webhooks.

---

## 6. Stop-Ship / Escalation Conditions

Escalate or halt promotion when:

- **Canonical webhook path** for production is **unclear** (multiple hosts/ports without a diagram).
- **Signature verification** regressed (401s across all events after a change) without an env explanation.
- **Smoke test** or **release verification** fails against the target URL (`docs/release-checklist.md`).
- **`npx prisma validate`** fails or **DB schema** is known out of sync with migrations — order updates may be wrong or failing silently.
- **Duplicate** money-side effects observed without a clear single subscribed URL.

---

## 7. Useful Commands / Endpoints

| Item | Detail |
|------|--------|
| Health | `GET /health` (main API); cheeky-os also `GET /healthz`, `GET /system/health` |
| Smoke / release verify | `npm run smoke:test` or `npm run release:verify` (from `email-intake/`), env `SMOKE_BASE_URL` |
| Canonical webhook | `POST /api/square/webhook` |
| Prisma check | `npx prisma validate` |
| Release checklist | `docs/release-checklist.md` |

---

## 8. Notes for Future Hardening

- Prisma schema alignment with production DB and generated client.
- Single documented production host + single Square subscription for invoice pipeline.
- Structured logging / correlation id for webhook `event_id` (no new infra assumed here).
