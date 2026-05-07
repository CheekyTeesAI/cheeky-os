# Cheeky OS — context (Bundle 1)

## Self-heal / Social OS + Email Intake v4.0 — 2026-04-20

- **`.nvmrc`** (repo root) and **`email-intake/.node-version`**: **`18.20.8`**
- **Dependencies:** `@azure/msal-node@^2.16.2`, `form-data@^4.0.0` added to **`email-intake/package.json`**; `axios`, `node-cron`, `winston` already present.
- **Prisma:** **`SocialPost`** model added to **`email-intake/prisma/schema.prisma`**. Manual SQL: **`prisma/migrations/20260421120000_add_social_post_social_os/migration.sql`**. **`prisma migrate deploy`** may fail with **P3009** until failed migration **`20260414120000_order_deposit_gate`** is resolved in Postgres — run **`prisma migrate resolve`** / repair DB, then deploy or execute the SocialPost SQL in pgAdmin.
- **EPERM self-heal:** `taskkill` + `rmdir ...\.prisma` + **`npx prisma generate`** succeeded; **`npm run build`** (`tsc`) with **`NODE_OPTIONS=--max-old-space-size=8192`**.
- **New TS:** `src/services/graphAuthService.ts`, `emailPoller.ts`, `emailProcessor.ts`; `src/services/social/*.ts`; **`src/routes/socialRoutes.ts`** (`GET /api/social/approve/:id`, `GET /api/social/posts`). **`cheeky-os/server.js`**: mounts **`/api/social`**, starts email poller + social scheduler inside **`app.listen`** callback when env vars set.
- **Voice bridge:** Email processor POSTs **`/cheeky/voice/run`** with **`{ text, source, fromEmail }`** (matches **`cheeky-os/routes/voice.js`**).
- **Startup:** With M365 / FB+IG unset, logs show **`[EmailIntake] M365 vars missing — disabled`** and **`[SocialOS] Social vars missing — disabled`**. **`systemEngine`** may still be **RED** / **`prisma_client_missing`** until DB + migrations align.
- **Smoke:** **`scripts/_recovery-smoke.js`** includes **`/api/social/posts`** (returns **`{ posts: [] }`** if **`SocialPost`** table missing). Five paths tested **200** on port **3847**.
- **RAM:** ~**7.7 GB** total — prefer **16 GB**; close Chrome/Edge before heavy builds; run **`cleanup.bat`** when needed.

## Local recovery log — 2026-04-20

- **`DATABASE_URL`** in `email-intake/.env` set to **`postgresql://localhost:5432/cheekytees`** (was `file:./dev.db`, which did not match the PostgreSQL datasource in `prisma/schema.prisma`). **`npx prisma validate --schema prisma/schema.prisma`** succeeds (no P1012).
- **`npm install`** (repo root): clean exit after **`postinstall`** was renamed to **`_postinstall`** in `email-intake/package.json` so install does not auto-run Prisma. When the machine can run generate, execute **`npm run _postinstall`** (or restore the `postinstall` script name and keep the same command string).
- **Prisma generate** was **not** fully restored on the audit machine (Windows **EPERM** on engine rename under `node_modules` / `src/generated`, and occasional **OOM** during `@prisma/client` generator). Add Defender exclusions for **`C:\Users\PatCo\source\repos\CheekyAPI\node_modules`** and **`...\src\generated`**, use **Node 18.x**, then **`npm run _postinstall`** until logs show **Generated Prisma Client**.
- **`prisma migrate deploy`** / **`migrate dev`**: blocked until PostgreSQL is reachable at **`localhost:5432`** with database **`cheekytees`** (P1001 if server down).
- **Smoke (port 3847)** — all four returned **200**: `/api/operator/deposit-followups`, `/api/operator/garment-orders`, `/api/reports/run`, `/dashboard` (see **`email-intake/scripts/_recovery-smoke.js`**).
- **Runtime**: startup may still show **`postgres: prisma_client_missing`** and **`systemEngine` RED** until generate + DB are both healthy.

### Self-repair continuation v2.1 — 2026-04-20 (agent session)

**Blocker 1 — Prisma generate (EPERM + Node 18):** **BLOCKED in automated session.** Step **1A** (Defender folder exclusions) must be done **manually** in Windows Security — cannot be scripted here. Steps **1B–1E** require **nvm-windows** with **Node 18.x**, closing other apps, **`taskkill /F /IM node.exe`**, then from **`email-intake`**:

```bat
npx prisma generate --schema prisma\schema.prisma
npm run postinstall:prisma
```

Confirm **`Generated Prisma Client`** with **no EPERM**. This environment intermittently failed to run `node` / `prisma` (**CLR / paging / “cannot execute the specified program”**), so those commands were **not** verified here.

**Blocker 4 — PostgreSQL + migrate:** **BLOCKED in automated session.** Local PostgreSQL must be **running** on **`localhost:5432`**, database **`cheekytees`** created, then:

```bat
cd C:\Users\PatCo\source\repos\CheekyAPI\email-intake
npx prisma validate --schema prisma\schema.prisma
npx prisma migrate deploy --schema prisma\schema.prisma
npx prisma generate --schema prisma\schema.prisma
```

Migrations already exist under **`email-intake/prisma/migrations/`** — use **`migrate deploy`** (not necessarily `migrate dev --name init`) unless you are authoring new migrations.

**Validation (v2.1 prompt):** Not completed here. From **`email-intake`**, start server with **`set PORT=3847`** and **`node cheeky-os\server.js`** (entry is **inside** `email-intake`, not `node ..\cheeky-os\server.js`). Then smoke the four URLs on **3847**; expect **no `prisma_client_missing`** and **systemEngine** not RED once DB + client are healthy.

**Pending log for next session (when local steps succeed):** Defender exclusions added, Node 18 active, `postinstall:prisma` exit 0, PostgreSQL up, migrations applied, systemEngine GREEN, four smoke routes 200.

### Final unblock v2.3 — 2026-04-20 (agent session)

Run the steps below **in your own terminal** (Node 18 via **nvm**, Defender exclusions, real **postgres** password). The Cursor agent shell is **not** the same as your machine.

| Step | Result |
|------|--------|
| **1 — `node --version`** | **BLOCKED** in agent — reported **v22.22.0**, not **v18.x**. Use **`nvm use 18.20.8`** in **your** shell before Prisma. |
| **2 — `taskkill /F /IM node.exe`** | **COMPLETE** — several `node.exe` processes terminated. |
| **3 — `cd` to `email-intake`** | **COMPLETE** (used in commands). |
| **4 — `prisma generate`** | **BLOCKED** — **EPERM** renaming `query_engine-windows.dll.node.tmp*` → `query_engine-windows.dll.node` under **`CheekyAPI\node_modules\.prisma\client\`**. Retry after Defender exclusions; Prisma CLI is often **hoisted** to repo root — use **`..\node_modules\prisma\build\index.js`** or **`npx prisma`** from **`email-intake`** if local `node_modules\.bin\prisma` is missing. |
| **5 — `migrate deploy`** | **NOT CONFIRMED** — no stable stdout in session (may need correct **`DATABASE_URL`** with password). |
| **6 — `DATABASE_URL` with password** | **USER ACTION** — do **not** commit secrets. Set locally: `postgresql://postgres:YOUR_PASSWORD@localhost:5432/cheekytees`. Current checked-in context used a URL **without** user/password (peer/trust may vary). |
| **7–8 — Server + smoke** | **NOT RUN** here (generate did not finish). |

**When everything is green on your PC:** log **Node 18.20.8**, **Generated Prisma Client**, **All migrations have been applied successfully**, **no `prisma_client_missing`**, **systemEngine GREEN**, four smoke URLs **200**.

## New routes (standalone server)

Run from `email-intake/`:

```bash
node cheeky-os/server.js
```

Default listen: **`0.0.0.0:3000`** when **`email-intake/.env`** sets **`PORT=3000`** and **`CHEEKY_OS_PORT=3000`**. Use **`npm start`**, which loads `.env` with **override** so a stale shell **`PORT`** (e.g. 3001) does not win.

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

- **`email-intake/` TypeScript server (`voice.run`) is unchanged** — Bundle 1 HTTP entry is **`cheeky-os/server.js`** only. Use port **3000** for local curl checks when `.env` matches.
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

---

## Phase 3 — Growth mode (additive, 2026)

**Purpose:** Patrick shifts toward sales **without** disrupting Jeremy's production cockpit.

### Business workflow (canonical recap)

CLIENT REQUEST → Square estimate / invoice → **deposit gate** → art → approvals → garments → production → pickup / payment. Growth actions **never** skip deposit, art, or approval gates.

### Design laws (Phase 3)

1. **Blockers beat growth** — cashflow / production stalls appear before pipeline cheerleading.
2. **Drafts-only outreach** — `growth/outreachDraftService.js` persists JSON under `data/outreach-drafts/` and **always** calls **`approvalGateService.createApproval`** with **`growth_outreach`**.
3. **Jeremy isolation** — growth UI/doc copy is labeled **Patrick**; Jeremy may ignore **`/api/growth/*`**, **`/api/outreach/*`**, **`/api/operator/morning-brief`** entirely.
4. **No autonomy** — no background mailers from these modules; no Square/Dataverse mutations in Phase 3 paths.
5. **CommonJS-only** cockpit extensions — **`require()`** / **`module.exports`**.

### Roles

| Role | Focus |
|------|-------|
| **Patrick** | Approvals, customer-facing drafts, prioritization (`morning-brief`), lead/opportunity scans |
| **Jeremy** | Blocker-first production execution, garment/work-order drafts after approval |
| **Operator** | Friction logging, shift handoff notes |

### Frozen / brittle areas (document only — do not "fix" blindly)

Historical sections above reference **PostgreSQL migration debt**, intermittent **Prisma generate EPERM**, and **marketing vs foundation** DB divergence. Treat those as infra blockers—not something the growth bundle rewrites.

### Coding rules recap

Additive files only; **`try/catch`** on HTTP surfaces; deterministic co-pilot text where **no outbound LLM** package is mandated; **`GROWTH_AI_GUARDRAIL`** string echoed inside outreach **`aiReasoning`** fields for auditability.

## Phase 5 v3.0 — customer transparency + Jeremy mobile maturity (additive, 2026)

### What shipped

- **Customer lookup / status:** **`GET /api/customer/search`**, **`GET /api/customer/status?token=`** backed by **`customer/customerSearchService.js`** — customer-safe wording only; tokens in **`data/customer-status-links.json`** (~30-day TTL when issued).
- **Self-service intake:** **`POST /api/intake/self-service`**, **`GET /api/intake/queue`** via **`intake/selfServiceIntakeService.js`** — queue file **`data/intake-self-service-queue.json`**, blocker cards + approvals **`self_service_intake_review`**; no quoting or production mutations from the form.
- **Monitoring:** **`GET /api/monitoring/system-health`** + **`monitoring/systemHealthService.js`** — surfaced in cockpit strip, morning brief, nightly growth review payloads where wired.
- **UI:** **`public/customer-intake.html`**, **`public/customer-status.html`**, **`public/operator-dashboard.html`** enhancements (sticky strip, intake preview, Jeremy training toggle, Patrick remote unchanged contract).

### Explicit non-goals (Phase 5)

No customer authentication, no payment capture in the browser, no status mutations by customers, no email/SMS auto-send from these routes, no hidden cron for customer flows.

### Phase 6 placeholders (documentation only)

Future hooks: authenticated **customer portal**, **analytics export** contracts, **advanced CRM sync**, **advanced automation** with explicit governance — implement only after a dedicated Phase 6 spec; Phase 5 leaves comments/README hooks only.

## Phase 7 v3.0 — enterprise usability + Cheeky-AI (additive, 2026)

Three persisted cockpit views (**Cheeky Advisor default**, **Jeremy**, **Patrick**) + anchored Cheeky-AI Helpbot (deterministic composer — **no LLM npm add**).

Key routes:

- `GET /api/dashboard/view-descriptor`
- `POST /api/cheeky-ai/ask`, `GET /api/cheeky-ai/search`, `GET /api/cheeky-ai/suggestions`
- `GET /api/accounting/summary`, `GET /api/accounting/ar-aging`, `GET /api/accounting/export-preview`
- `GET /api/reporting/advanced/weekly`, `monthly`, `GET /api/reporting/advanced/export/:type`
- `GET /api/backup/snapshot`, `GET /api/backup/status`
- `GET /api/team/activity`
- `GET /api/system/full-status`
- `GET /api/system/full-health-check`

Operational law unchanged: blockers/cashflow first, approvals gate intact, absolutely **no autonomous sends or vendor mutations** from these modules.

Hardening posture: Cheeky Advisor is now the operational command layer. It must always explain missing data, show safe cached fallbacks, and route humans to approval-gated actions instead of executing anything.

