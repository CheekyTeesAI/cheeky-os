# Cheeky OS v1 Launch Readiness

## Boot and Entrypoint
- Production/root boot file: `render-http.js` (loads `email-intake/cheeky-os/server.js`).
- App script boot file: `email-intake/package.json` -> `npm start` -> `node cheeky-os/server.js`.
- Health checks verified: `/health`, `/healthz`, `/api/health`, `/system/health`.

## Verified Core Routes
- `GET /`
- `GET /dashboard`
- `GET /control`
- `POST /api/ai/execute`
- `GET /api/operator/summary`
- `GET /api/operator/sales`
- `GET /api/operator/pipeline`
- `GET /api/operator/payments`
- `GET /api/operator/payment-status`
- `GET /api/operator/release`
- `GET /api/operator/vendor-drafts`
- `GET /api/operator/readiness`

## Verified Action Routes
- `POST /api/lead`
- `POST /api/operator/payments/:id/mark-paid`
- `POST /api/operator/release/:id/evaluate`
- `POST /api/operator/release/:id/mark-blanks-ordered`
- `POST /api/operator/vendor-drafts/:id/create`

## Gate Behavior Verified
- Unpaid deposit blocks `advance task` from `PRODUCTION_READY`.
- Unreleased task blocks `mark blanks ordered`.
- Release evaluation requires verified payment truth (`depositPaid` + payment status).
- Unknown linkage defaults fail-closed for production movement.

## Safe Mode / Automation Defaults
- `ENABLE_PROACTIVE` defaults to off unless explicitly `true`.
- `AUTOPILOT` defaults to off unless explicitly `true`.
- `AUTO_FOLLOWUP` defaults to off unless explicitly `true`.
- Existing automation runner remains controlled by `AUTOMATION_CRON_ENABLED=true`.

## Required Environment Variables (Launch Core)
- `DATABASE_URL`

## Optional Environment Variables
- `PORT` / `CHEEKY_OS_PORT`
- `SQUARE_WEBHOOK_SIGNATURE_KEY`
- `SQUARE_WEBHOOK_NOTIFICATION_URL`
- `SQUARE_WEBHOOK_SIGNATURE_SKIP_VERIFY` (avoid in production)
- `AUTOPILOT`
- `AUTO_FOLLOWUP`
- `ENABLE_PROACTIVE`
- `AUTOMATION_CRON_ENABLED`
- `CHEEKY_REQUEST_LOGS`
- `CHAD_API_KEY`
- `MS_TENANT_ID`, `MS_CLIENT_ID` (email poller integration)

## Known Launch Constraints
- Vendor drafts are payload-only in current mode (no DB persistence table yet).
- No real vendor API calls are made.
- No auto-send messaging and no auto-charge flows are enabled in this launch pass.

## Manual Launch Steps
1. Start app: `npm start` (inside `email-intake`).
2. Open `/control`.
3. Run `where is my money`.
4. Create lead via `POST /api/lead`.
5. Confirm unpaid via `GET /api/operator/payments`.
6. Mark deposit paid via `POST /api/operator/payments/:id/mark-paid`.
7. Evaluate release via `POST /api/operator/release/:taskId/evaluate`.
8. Mark blanks ordered via `POST /api/operator/release/:taskId/mark-blanks-ordered`.
9. Create vendor draft via `POST /api/operator/vendor-drafts/:taskId/create`.
10. Verify launch state via `GET /api/operator/readiness`.
