# CHEEKY OS v1.0 — Founder reference (locked)

**Status (maintenance):** TypeScript **`npm run build`** is the source of truth for **`dist/`** (webhook + **`productionKickoff`**). On Windows, **`prisma generate`** can **EPERM** on a hoisted `node_modules\.prisma` — use **`npm run prisma:generate`** (retries + delays) or close locking Node processes; **`tsc`** can still pass if the client is already generated.

**Terminal self-fix (repeatable):**
```bash
cd email-intake
npm run prisma:clean
npm run prisma:generate
npm run build
```
Goal: **`npm run build`** exit **0**. If generate still fails after retries, reboot or exclude the repo from real-time AV scanning on `node_modules\.prisma`.

**In one sentence:** Every dollar that unlocks production flows **intake → structured quote (OpenAI JSON) → Square invoice on the same intake row → a single verified Square webhook → Prisma + mirrored `ct_*` fields**—not through side doors in Power Automate or hand-edited Dataverse flags.

---

## How the loop works

**Flow:** `ct_intake_queue` **→** `QUOTE_PENDING` + OpenAI **`cheeky_quote_v1`** into **`ct_parsed_json`** **→** Square deposit invoice **→** PATCH row with **`ct_square_invoice_id`** + stage **`INVOICE_SENT` / `DEPOSIT_PENDING`** **→** customer pays **→** **`POST /api/square/webhook`** (HMAC) **→** `runCanonicalSquareWebhookPipeline` **→** deposit on **`Order`**, job/garment policy **→** **`mirrorDepositToDataverse`** (`ct_deposit_paid`, **`GATE_PASSED`**, **`ct_prisma_order_id`**).

1. **Intake is the system of record for “why this order exists.”** Power Apps “New Order,” web, email, or phone lands in **`ct_intake_queue`** first—not as a mystery “already paid” row.

2. **Quoting is structured, not vibes.** Use the OpenAI connector (custom OpenAPI) or **`POST /api/cheeky-intake/quote-parse`** with **`prompts/CHEEKY_TEES_QUOTE_SYSTEM_PROMPT.md`**. Output must be **JSON only** with **`version: "cheeky_quote_v1"`**; that object is what you store and invoice from.

3. **The invoice id must live on the intake row** before you treat money as real ops revenue. No invoice id on the row means downstream correlation is broken by definition.

4. **One Square webhook in production:** **`POST /api/square/webhook`** on Node. That path owns **`processSquareWebhook`** / cash-to-order alignment (e.g. **`squareId`** on **`Order`**).

5. **Strict gate (default in production):** If **`CHEEKY_CT_INTAKE_GATE_STRICT`** is **`true`** or **unset while `NODE_ENV=production`**, Node **requires** a Dataverse **`ct_intake_queues`** row with a matching **`ct_square_invoice_id`** in an **allowed** stage **before** applying deposit / unlock logic. Fail closed → audit + optional **`CHEEKY_FOUNDER_ALERT_WEBHOOK_URL`**.

6. **Bypass is explicit, not silent:** With strict mode on, orphan-payment “mint an order anyway” paths (**e.g.** `tryEnsureOrderAfterWebhookNoMatch`) **do not** rescue you—by design.

7. **Tiles and dashboards** read the mirrored **`ct_*`** fields so Power Apps stays aligned without a second financial spine.

---

## What you must stop doing

| Stop | Why |
|------|-----|
| A **second** Square webhook (e.g. straight into Power Automate) for money events | You split truth; deposits and productionUnlock diverge. |
| Skipping **`ct_intake_queue`** to “go faster” | Strict gate **blocks**; you get audit noise and real orders stuck—not speed. |
| Manually flipping **`ct_deposit_paid`** or production flags to “fix” stuck work | You’re lying to the system; use break-glass + **audit** and expect alerts. |
| Using **Claude** as the default quote path for **new** installs | **OpenAI + `cheeky_quote_v1`** is v1 standard (`connectors/openai-chat-completions-v1.openapi.yaml`). |
| Shipping production **`/api/cheeky-intake/quote-parse`** without **`CHEEKY_INTAKE_QUOTE_API_KEY`** | In **`NODE_ENV=production`**, missing key → **401**; flows break mysteriously. |
| “Just editing” Prisma **`Order`** in the DB to match Square | Webhook + intake correlation is the contract; DB edits bypass gates and reporting. |

---

## One-switch reference

| Setting | Effect |
|---------|--------|
| **`CHEEKY_CT_INTAKE_GATE_STRICT=true`** or **unset in production** | Intake + invoice correlation **mandatory** before deposit unlock. |
| **`CHEEKY_CT_INTAKE_GATE_STRICT=false`** | Legacy / local dev without full Dataverse alignment. |
| **`CHEEKY_FOUNDER_ALERT_WEBHOOK_URL`** | Optional instant POST on **gate failure** (Teams / internal) in addition to **`ct_audit_event`**. |

**Bottom line:** If it isn’t **intake + JSON quote + invoice on row + one webhook + mirror**, it isn’t v1—it’s support debt or a documented exception.

---

## Printavo-style shop layer (Phase A live on Node + Dataverse design)

The **deposit gate is not optional.** The production board, tasks, and POs are **downstream** of **`GATE_PASSED`** + **`ct_deposit_paid`**.

| Capability | What it is | Where it lives |
|------------|------------|----------------|
| **Configurable pipeline + board** | Kanban columns from **`ct_stage_definition`**; funded-only cards = **`ct_intake_queue`** filtered **`GATE_PASSED`** + **`ct_production_stage_code`**. | **`POWER_FX_PRODUCTION_BOARD.md`** · seed **`dataverse/seed_ct_stage_definition.json`** |
| **Auto tasks on gate pass** | After **`mirrorDepositToDataverse`** succeeds, Node runs **`ensureJobShellForDepositedOrder`** + **`generateTasksForOrder`** (Prisma **`Task`**). Intake **`ct_production_stage_code`** set to **`DEPOSIT_PAID`** (or **`CHEEKY_CT_INITIAL_PRODUCTION_STAGE`**). | **`cheeky-os/services/productionKickoff.service.js`** (called from **`ctSync.service.js`**) |
| **Optional Dataverse tasks** | Set **`CHEEKY_CT_MIRROR_TASKS_TO_DV=true`** to POST **`ct_production_task`** rows (after table + choices exist). | Env flag |
| **Proof mirror** | Set **`CHEEKY_CT_MIRROR_PROOF_TO_INTAKE=true`** once intake has **`ct_proof_*`** columns. | Env flag |
| **Proof / PO entities** | **`ct_proof_asset`**, **`ct_purchase_order`** for customer files and blank receiving. | Dataverse schemas |

### What must **never** be bypassed

- **No** production board, **no** task checklist, **no** PO screen may set **`ct_deposit_paid`**, **`ct_status = GATE_PASSED`**, or **`ct_square_invoice_id`** as a substitute for the **Square webhook + strict intake correlation**.
- **No** Canvas control, form, or Power Fx **`Patch`** visible to **Shop / Production** roles may target **`ct_deposit_paid`**, **`ct_status`**, or **`ct_square_invoice_id`**. Only **System Administrator**, **service principal** used by Node, or a locked-down **Owner** role may change gate fields (ideally only via automation).
- **`CHEEKY_CT_PRODUCTION_KICKOFF`** only runs **after** a successful mirror PATCH (money already validated by the gate). Turning kickoff off does **not** weaken the gate; it only skips task generation.

**Spec:** `PRINTAVO_STYLE_LAYER.md` · **schemas:** `dataverse/*.schema.json`

---

**Next:** `GO_LIVE_CHECKLIST.md` · `IMPLEMENTATION_SUMMARY_V1.md` · `flows/ESTIMATE_CONVERSION_OPENAI.md`
