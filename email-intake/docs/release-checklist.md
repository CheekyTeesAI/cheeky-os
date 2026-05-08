# Cheeky OS Release Checklist

This repo’s primary API process is **`src/api/voice.run.ts`** (npm script: `dev`). A second surface exists at **`cheeky-os/server.js`** (mobile/revenue bundle). Adjust URLs and ports for your environment.

**Related:** [Money-path incident runbook](./money-path-incident-runbook.md) (webhooks, signatures, payment state).

---

## Pre-Deploy

Run from repository root **`email-intake/`** (where `package.json` lives).

| Check | Command / action |
|-------|------------------|
| Dependencies installed | `npm ci` or `npm install` (runs `postinstall` → `prisma generate`) |
| Prisma client generated | Confirmed by successful install, or run `npx prisma generate` |
| Schema valid | `npx prisma validate` |
| TypeScript (known: may still report app/Prisma drift) | `npm run typecheck` — review failures; do not treat as green unless your release bar says so |
| Production build artifact (if you ship `dist/`) | `npm run build` (`tsc`) — exit 0 required if `dist/` is required for your deploy |
| Scheduler intent | Confirm **`ENABLE_SCHEDULER`** for target env: default **off**; set `ENABLE_SCHEDULER=true` only if command-layer hourly/daily jobs should run (see server logs on boot) |
| Money-path env | `.env` / hosting secrets include: `DATABASE_URL`, Square tokens (`SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID`), webhook HMAC (`SQUARE_WEBHOOK_SIGNATURE_KEY`, `SQUARE_WEBHOOK_NOTIFICATION_URL` when verifying), `API_KEY` where used |
| Canonical webhook URL documented for Square Dashboard | **`POST /api/square/webhook`** on the host running `voice.run` (raw body + signature verification when configured) |
| Smoke script ready | `npm run smoke:test` — run locally against a **running** server before deploy if possible |

---

## Deploy

There is **no single prescribed host** in-repo; use your platform’s process.

| Surface | Typical start (from `email-intake/`) |
|---------|--------------------------------------|
| Main API | `npm run dev` (dev) or run `node --import tsx ./src/api/voice.run.ts` / build `dist` and run compiled entry if your process uses `tsc` output |
| Cheeky OS bundle | `node cheeky-os/server.js` (uses `PORT` / `CHEEKY_OS_PORT`, default **3000** in that file) |

- Apply DB migrations in your pipeline if you use them: `npx prisma migrate deploy` (production) when appropriate.
- Ensure **`PORT`** (default **3000** in `src/utils/config.ts`) matches load balancer / Square webhook URL.

---

## Post-Deploy

With **`SMOKE_BASE_URL`** set to your public base (e.g. `https://api.example.com` or `http://127.0.0.1:3000`):

| Check | Command / action |
|-------|------------------|
| Health | `GET /health` — expect **200** (JSON `{ "status": "ok" }` on main API) |
| System probe (if exposed) | `GET /system/check` — expect **200** |
| Automated smoke | `npm run release:verify` or `npm run smoke:test` (same runner) |
| Server logs | Confirm **scheduler** line: either “scheduler disabled” or “started” when `ENABLE_SCHEDULER=true` |
| Webhook | Canonical path responds per smoke test (signature behavior depends on env — see `scripts/smoke-test.js` header) |
| Cheeky OS surface (if used) | `GET /healthz` or `GET /health` on that process’s port |

---

## Stop-Ship Conditions

Do **not** promote the release if any of the following are true for your required bar:

- **`npm run build`** fails when `dist/` is required for the deployment path.
- **`npx prisma validate`** fails.
- **Smoke test fails** against the target URL (`npm run smoke:test` with `SMOKE_BASE_URL` set).
- **Money-path secrets** missing or wrong in the deployment environment (DB, Square, webhook HMAC).
- **Database / migration state** unknown or broken (schema not applied, wrong `DATABASE_URL`).
- **Webhook verification** regresses: e.g. `SQUARE_WEBHOOK_NOTIFICATION_URL` does not match the URL Square signs (401/500 on canonical webhook when verification is on).

---

## Quick reference

| Item | Value |
|------|--------|
| One-command verification (HTTP checks) | `npm run release:verify` or `npm run smoke:test` |
| Default smoke URL | `http://127.0.0.1:3000` (`SMOKE_BASE_URL`) |
| Canonical Square webhook | `POST /api/square/webhook` |
| Scheduler flag | `ENABLE_SCHEDULER=true` to enable command-layer scheduler in `voice.run.ts` |
