# CHEEKY OS v1.0 — Go-live checklist (step-by-step)

Use this in order. **Strict gate** and **single webhook** assumptions apply to **production** unless you explicitly set **`CHEEKY_CT_INTAKE_GATE_STRICT=false`** for a sandbox.

---

## 0. Preconditions

- [ ] Repo path: **`email-intake/`** (Cheeky OS Node app + Prisma).
- [ ] **Self-fix build block (run in order):**
  ```bash
  cd email-intake
  npm run prisma:clean
  npm run prisma:generate
  npm run build
  ```
  - **`npm run prisma:generate`** runs **`scripts/prisma-generate-retry.js`** (multiple attempts, **3s** apart) because **`prisma generate --force`** is not portable.
  - **`npm run build`** must exit **0** (produces **`dist/`** for webhook + **`productionKickoff`**).
- [ ] **Stage seed CSV:** from **`email-intake/`** run **`npm run seed:stages:csv`** → updates **`docs/.../seed_ct_stage_definition.csv`** for Excel import into **`ct_stage_definition`**.
- [ ] If **`prisma generate`** still **EPERM** after retries: stop all **`node.exe`** using this repo, delete **`node_modules/.prisma`** at **monorepo root**, **`npm install`**, repeat the block; last resort reboot.
- [ ] PostgreSQL URL available; migrations applied for **`email-intake/prisma/schema.prisma`**.

---

## 0b. Phase A — Dataverse tables + stage seed

- [ ] Tables created per **`docs/cheeky-os-v1-unification/dataverse/*.schema.json`**: **`ct_stage_definition`**, **`ct_production_task`**, **`ct_proof_asset`**, **`ct_purchase_order`**, **`ct_shop_config`** (optional), extended **`ct_intake_queue`**.
- [ ] Seed **`ct_stage_definition`** using **`dataverse/seed_ct_stage_definition.json`**, **`seed_ct_stage_definition.csv`** (from **`npm run seed:stages:csv`**), and **`dataverse/SEED_STAGES_INSTRUCTIONS.md`**.
- [ ] After columns exist: set **`CHEEKY_CT_MIRROR_PROOF_TO_INTAKE=true`** (optional) so proof fields mirror on deposit.

---

## 0c. Phase A — Canvas Production Board

- [ ] New or existing app: build **Production Board** per **`POWER_FX_PRODUCTION_BOARD.md`** (funded-only filter); **embed** **`conProductionBoardShell`** on the existing dashboard if desired.
- [ ] **Security (Power Platform):**
  - Create or edit **Security Role** “Cheeky Shop” (example): **Business Management** tab — **Intake Queue** entity **`ct_intake_queue`** / **`ct_intake_queues`**: **Write** on columns **`ct_production_stage_code`**, **`ct_target_ship_date`**, **`ct_production_due_date`**, **`ct_bottleneck_reason`** only where possible (column-level security); **no User** write on **`ct_deposit_paid`**, **`ct_status`**, **`ct_square_invoice_id`**, **`ct_prisma_order_id`** for shop roles.
  - Use **Field security profile** or **remove Update privilege** on gate attributes at form level; **automation user** / **service principal** retains full write for Node mirror.
- [ ] Assign “Cheeky Shop” to operators; verify a test user **cannot** **Patch** **`ct_deposit_paid`** from Canvas.

---

## 0d. Phase A — Node kickoff env (after mirror)

| Variable | Default | Purpose |
|----------|---------|---------|
| **`CHEEKY_CT_PRODUCTION_KICKOFF`** | on | Set **`false`** to skip **`generateTasksForOrder`** |
| **`CHEEKY_CT_INITIAL_PRODUCTION_STAGE`** | **`DEPOSIT_PAID`** | First board column code; must match a seed stage |
| **`CHEEKY_CT_MIRROR_TASKS_TO_DV`** | off | **`true`** to POST **`ct_production_task`** (advanced) |

- [ ] Deploy **`email-intake`** with fresh **`dist/`** after **`npm run build`** so **`productionKickoff.service.js`** can load **`dist/services/taskGenerator.js`**.

---

## 1. Environment variables (exact names)

Set on the **production** host (or your secret store). Values are examples—replace with yours.

### Core

| Variable | Required | Purpose |
|----------|----------|---------|
| **`DATABASE_URL`** | Yes | PostgreSQL for Prisma **`Order`**, **`Job`**, **`Task`**, etc. |
| **`NODE_ENV`** | Prod: **`production`** | Production defaults (e.g. strict gate, quote route auth). |

### Square (webhook + API)

| Variable | Required | Purpose |
|----------|----------|---------|
| **`SQUARE_ACCESS_TOKEN`** | Yes* | Square API calls (invoice, payments) as used by your deployment. |
| **`SQUARE_ENVIRONMENT`** | Recommended | `sandbox` / `production` per Square SDK usage. |
| **`SQUARE_WEBHOOK_SIGNATURE_KEY`** | Yes (prod) | Verify **`x-square-hmacsha256-signature`** on **`POST /api/square/webhook`**. |
| **`SQUARE_WEBHOOK_NOTIFICATION_URL`** | Recommended | Must match the **exact** public URL registered in Square (no stray path/query drift). |

*If your fork uses different Square env names, align **`server.js`** / webhook loader with what you set.

### Dataverse (strict gate + mirror)

| Variable | Required (strict) | Purpose |
|----------|-------------------|---------|
| **`DATAVERSE_URL`** | Yes | Instance root (e.g. `https://org.crm.dynamics.com`). |
| **`DATAVERSE_TENANT_ID`** | Yes | Azure AD tenant. |
| **`DATAVERSE_CLIENT_ID`** | Yes | App registration client id. |
| **`DATAVERSE_CLIENT_SECRET`** | Yes | Secret for client-credentials token. |
| **`CHEEKY_CT_INTAKE_GATE_STRICT`** | Optional | `true` or **unset** in production → strict **on**. Set **`false`** only for dev/sandbox without Dataverse. |
| **`CHEEKY_CT_INTAKE_ENTITY_SET`** | Optional | Override entity set (default **`ct.intake_queues` → dataverse** resolution per `ctSync`). |
| **`CHEEKY_CT_AUDIT_ENTITY_SET`** | Optional | Audit entity set override. |
| **`CHEEKY_CT_INTAKE_SQUARE_INVOICE_FIELD`** | Optional | Logical name override for invoice id column. |

### OpenAI quoting (connector **or** Node mirror)

| Variable | Required | Purpose |
|----------|----------|---------|
| **`OPENAI_API_KEY`** | Yes (if using Node **`quote-parse`**) | Chat Completions for **`parseQuoteForIntake`**. |
| **`OPENAI_QUOTE_MODEL`** | Optional | Default **`gpt-4o`**. |
| **`CHEEKY_QUOTE_PROMPT_PATH`** | Optional | Override path to **`prompts/CHEEKY_TEES_QUOTE_SYSTEM_PROMPT.md`**. |
| **`CHEEKY_INTAKE_QUOTE_API_KEY`** | **Yes in production** for HTTP | Power Automate / tools send **`x-cheeky-intake-key`** (or **`x-cheeky-internal-key`**). If unset in **`production`**, route returns **401**. |

### Alerts

| Variable | Required | Purpose |
|----------|----------|---------|
| **`CHEEKY_FOUNDER_ALERT_WEBHOOK_URL`** | Optional | POST JSON on deposit gate / critical failures (e.g. Teams incoming webhook). |

---

## 2. Power Platform export (inventory)

1. [Power Apps](https://make.powerapps.com) → **Solutions** → production Cheeky solution → **Export** (managed for downstream).
2. Download each **Canvas app** **`.msapp`**.
3. Store **`.zip` / `.msapp`** in secure storage; diff against repo solution if you track **`CheekyTeesAutomationSolution/`**.

---

## 3. Dataverse tables (dev → prod)

Create or verify (see **`docs/cheeky-os-v1-unification/dataverse/*.schema.json`**):

- [ ] **`ct_intake_queue`** (entity set commonly **`ct_intake_queues`**).
- [ ] **`ct_audit_event`** (**`ct_audit_events`**).
- [ ] Columns at minimum: **`ct_square_invoice_id`**, **`ct_status`**, **`ct_deposit_paid`**, **`ct_prisma_order_id`**, optional **`ct_margin_hold`**, **`ct_parsed_json`** (or equivalent for quote JSON).
- [ ] Publish; add to solution; grant automation user **create** on audit.

---

## 4. OpenAI custom connector (import)

1. **Power Automate** → **Data** → **Custom connectors** → **New** → **Import an OpenAPI from file**.
2. File: **`docs/cheeky-os-v1-unification/connectors/openai-chat-completions-v1.openapi.yaml`**.
3. **Security:** **OAuth2** or **API Key** per YAML (typically **Bearer** token = OpenAI API key).
4. **Create connection**; test **`CreateChatCompletion`** with body including **`response_format: { "type": "json_object" }`**.
5. Wire **QUOTE_PENDING** flow per **`flows/ESTIMATE_CONVERSION_OPENAI.md`**; persist **only** valid **`cheeky_quote_v1`** JSON into **`ct_parsed_json`**.

---

## 5. Harden Power Automate

- [ ] **Remove** or **disable** any Square → **instant flow** “create paid order” path in **production**.
- [ ] Ensure **`CreateNewOrderFromInvoice`**-style logic cannot mark ops-paid without **intake + webhook** correlation.
- [ ] Optional: **`flows/ALERT_AUDIT_EVENT_FLOW.md`** on **`ct_audit_event`** HIGH/CRITICAL.

---

## 6. Intake + invoice discipline

- [ ] **New Order** in Power Apps → **`Patch`** **`ct_intake_queue`** only (stage **`INTAKE_NEW`** / channel), not a final paid entity.
- [ ] After OpenAI quote → create/send **Square deposit invoice** from structured JSON.
- [ ] **PATCH same intake row** with **`ct_square_invoice_id`** + **`INVOICE_SENT`** or **`DEPOSIT_PENDING`**.

---

## 7. Deploy Node (commands)

From **`email-intake/`** (or workspace root if you use nested installs):

```bash
cd email-intake
npm ci
npm run prisma:clean
npm run prisma:generate
npx prisma migrate deploy
npm run build
npm start
```

- **Port:** **`PORT`** or **`CHEEKY_OS_PORT`**, else **3000**.
- **Health:** **`GET http://127.0.0.1:3000/health`** (see boot logs for paths on your host).

Mount **`/api/cheeky-intake`** and **`/api/square/webhook`** must match your reverse proxy (see **`cheeky-os/server.js`**).

---

## 8. Square production cutover

1. [ ] In **Square Developer** → your app → **Webhooks** → **one** subscription URL:  
    **`https://<public-host>/api/square/webhook`**
2. [ ] Paste **`SQUARE_WEBHOOK_SIGNATURE_KEY`** from Square into production env.
3. [ ] Set **`SQUARE_WEBHOOK_NOTIFICATION_URL`** to that **exact** HTTPS URL.
4. [ ] Send a **test notification** from Square dashboard; confirm **200** and logs (no HMAC errors).
5. [ ] Remove/disable **any second** webhook endpoint that applied money or created paid orders.

---

## 9. Power Apps tiles

- [ ] Galleries use views documented in **`POWER_FX_TILES.md`** (`ct_deposit_paid`, `ct_status`, `ct_margin_hold`).
- [ ] Restrict who can edit **`ct_deposit_paid`** on forms.

---

## 10. Test matrix — happy path

| Step | Action | Expected |
|------|--------|----------|
| 1 | Intake row + **`ct_square_invoice_id`** set | Stage **`INVOICE_SENT`** / deposit pending |
| 2 | Prisma **`Order`** has same **`squareInvoiceId`** / correlation as designed | Match for webhook |
| 3 | Pay deposit in Square (sandbox or low test) | Webhook **200** |
| 4 | Node | **`depositPaidAt` / deposit fields** updated; job/garment per policy |
| 5 | Dataverse | **`ct_deposit_paid`**, **`GATE_PASSED`**, **`ct_prisma_order_id`** |
| 6 | Node kickoff | **`generateTasksForOrder`** ran; Prisma **`Task`** rows; intake **`ct_production_stage_code`** = **`DEPOSIT_PAID`** (or your override) |
| 7 | Production Board (Canvas) | Card appears in **Deposit paid** column |
| 8 | Tiles | Counts move consistently |

---

## 11. Adversarial tests (must fail or alert)

| # | Attempt | Expected |
|---|---------|----------|
| B1 | Pay invoice **without** matching intake (strict **on**) | No deposit unlock; **`ct_audit_event`**; optional founder webhook |
| B2 | Intake stuck in **`INTAKE_NEW`** only | Gate reject |
| B3 | Replay same Square `event_id` | Idempotent; no double unlock |
| B4 | **`tryEnsureOrderAfterWebhookNoMatch`** | **Not** used when strict **on** |
| B5 | Second Square webhook to PA | **Not** subscribed / not used for money |
| B6 | Manual **`ct_deposit_paid`** flip | Tamper detection / alert if flow enabled |
| B7 | Missing **`dist/`** | **`webhook_engine_unavailable`** or inline fallback only—restore build artifact |
| B8 | OpenAI returns non-JSON or bad schema | **`quote-parse`** returns **`ok: false`** with validation / parse error; audit **`QUOTE_AI_FAILED`** |

---

## 12. Sign-off

- [ ] Single Square webhook (**Node**).
- [ ] Strict gate: **`CHEEKY_CT_INTAKE_GATE_STRICT=true`** or **unset** with **`NODE_ENV=production`**.
- [ ] No PA “paid order” without intake + webhook.
- [ ] **`npm run build`** in CI/deploy; ship **`dist/`** (`productionKickoff` + webhook parity).
- [ ] **`ct_stage_definition`** seeded; Production Board app imported or built.
- [ ] OpenAI connector + **`CHEEKY_INTAKE_QUOTE_API_KEY`** (if using **`quote-parse`**).
- [ ] Founder read: **`FOUNDER_CHEEKY_OS_V1_LOCKED.md`**.

---

**Related:** `IMPORT_TEST_CHECKLIST.md`, `01-UNIFICATION_PLAN.md`, `flows/SQUARE_INVOICE_PAID_HARDENED.md`, `flows/ESTIMATE_CONVERSION_OPENAI.md`, `PRINTAVO_STYLE_LAYER.md` (Printavo-style board/tasks/proofs/POs).

---

## 13. First end-to-end test (Intake → quote → deposit → board)

1. **Dataverse:** Create **`ct_intake_queue`** row, **`INTAKE_NEW`**, customer fields; move to **`QUOTE_PENDING`** with raw text (or **`PARSED`**).
2. **Quote:** Power Automate OpenAI connector or **`POST /api/cheeky-intake/quote-parse`** → store JSON in **`ct_parsed_json`**; create Square deposit invoice; **`PATCH`** row with **`ct_square_invoice_id`**, status **`INVOICE_SENT`** / **`DEPOSIT_PENDING`**.
3. **Pay deposit** in Square (sandbox or test amount).
4. **Webhook:** **`POST /api/square/webhook`** returns **200**; Node applies Prisma deposit; **`mirrorDepositToDataverse`** sets **`GATE_PASSED`**; **`productionKickoff`** runs **`generateTasksForOrder`**; intake **`ct_production_stage_code`** = **`DEPOSIT_PAID`**.
5. **Canvas:** Open Production Board — card visible in **Deposit paid**; **Job detail** shows tasks (Dataverse **`ct_production_task`** only if **`CHEEKY_CT_MIRROR_TASKS_TO_DV=true`**; otherwise confirm tasks in Postgres / internal tools).

