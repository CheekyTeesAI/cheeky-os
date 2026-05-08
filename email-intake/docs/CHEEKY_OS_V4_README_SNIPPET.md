# Cheeky OS v4.3 — README snippet for `email-intake/README.md`

If `README.md` is not writable on disk, paste this block after the first `#` heading.

## Cheeky OS v4.3 (production)

The live HTTP stack is **`cheeky-os/server.js`** (`npm start` from this folder). Power Apps: **`docs/cheeky-os-power-apps-connector.openapi.yaml`** · **`docs/power-apps-dashboard-integration-playbook.md`**. Verify: **`npm run test:dashboard`** (requires `tiles.HealthSummary`).

### Quick start

```powershell
cd email-intake
Copy-Item .env.example .env
npm install
npm run build
npm start
```

- **Dashboard**: **GET /** redirects to **GET /dashboard** (HTML + Tailwind CDN).
- **Health / metrics**: **GET /health**, **GET /metrics** (Prometheus text; `?format=json` for JSON).
- **Admin**: set **`CHEEKY_ADMIN_API_KEY`**, header **`X-Cheeky-Admin-Key`** — **POST /admin/restart-worker**, **POST /admin/trigger-test-intake**.
- **Smoke**: **`npm run intake-e2e`** · **Docker**: **`docker compose up --build`** · **PM2**: **`bash deploy.sh`**

### Deployment

| Target | Notes |
|--------|--------|
| Docker | `Dockerfile` + `docker-compose.yml` |
| Bare Node | `npm ci && npm run build` then `node -r ./scripts/cheekyOsLoadEnv.js ./cheeky-os/server.js` |
| PM2 | `deploy.sh` or `pm2 start npm --name cheeky-os -- start` |
| Azure App Service | Linux container; map env from `.env.example` |
| IIS | iisnode pointing at `cheeky-os/server.js`; align `PORT` with site binding |

### Troubleshooting

- **`intake_queue_module_load_failed`** → run **`npm run build`** (`dist/services/intakeQueuePrintingService.js`).
- Worker idle → **`WORKER_ENABLED=true`** + **`DATAVERSE_*`**.
- Admin **503** → set **`CHEEKY_ADMIN_API_KEY`**.
