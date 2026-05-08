# CHEEKY OS v1.0 — Power Platform + Node unification plan

This plan closes every gap called out in the evidence-based audit: **one intake queue**, **one deposit gate**, **one schema (`ct_`)**, **one Square ingress**, **audit + alerts**.

---

## 1. Architectural decisions (locked)

| Topic | Decision | Rationale |
|--------|-----------|-----------|
| **System of record (SOF) for money + stage** | **PostgreSQL `Order` (Prisma)** in `email-intake` | Already enforces `depositPaidAt`, stage engine, QC/purchasing gates, webhook HMAC. |
| **Dashboard + ops lists** | **Dataverse `ct_*`** tables | Power Apps tiles bind here; must **mirror** SOF after validated events. |
| **Square webhook master** | **Node only** — `POST /api/square/webhook` (canonical) | Single HMAC verification, idempotency, one place to enforce correlation. |
| **Legacy Power Automate HTTP Square trigger** | **Disable** in production after cutover | Prevents duplicate production jobs and “create paid order” bypass. |
| **Schema naming** | **`ct_` publisher prefix** | Align with `CheekyOsSolution` and `email-intake/dataverse/schemas`. Migrate `crb_*` → `ct_*` or use **virtual integration table** only during transition (not recommended long-term). |
| **AI for estimate / QUOTE_PENDING** | **OpenAI (gpt-4o / gpt-4-turbo)** via **custom connector** `connectors/openai-chat-completions-v1.openapi.yaml` + master prompt `prompts/CHEEKY_TEES_QUOTE_SYSTEM_PROMPT.md`; Node mirror `POST /api/cheeky-intake/quote-parse` | Structured **`cheeky_quote_v1` JSON**; Power Platform–friendly; aligns with existing `OPENAI_API_KEY` usage in repo. **Claude** connector retained as **optional fallback** only. |

---

## 2. Unified lifecycle (mandatory loop)

```
[Intake ANY channel]
    → POST/PATCH ct_intake_queue (status INTAKE_NEW → PARSED → QUOTE_PENDING)
    → Flow or Node: **OpenAI** (connector or `/api/cheeky-intake/quote-parse`) → `ct_parsed_json` = cheeky_quote_v1 JSON
    → Square: create & send invoice (deposit) — store ct_square_invoice_id on SAME intake row (or ct_orders pre-order key)
    → [STOP] — no production job, no art folder, no “Production Ready” until gate passes

[Square payment.updated / invoice paid]
    → ONLY Node webhook (master)
    → Verify HMAC, idempotency key = event_id + invoice_id
    → Lookup Prisma Order + correlation to ct_intake_queueid / external key
    → IF no correlated INTAKE row with invoice id → write ct_audit_event (BYPASS_ATTEMPT), NOTIFY founder, DO NOT create paid order in Dataverse
    → IF OK → set depositPaidAt (Prisma), ct_deposit_paid + gated stage (Dataverse), enqueue blanks/production ONLY via approved child paths
```

---

## 3. Gap → remediation map (from audit)

| Audit item | Remediation |
|------------|-------------|
| `crb_*` vs `ct_*` | Migration doc `02-SCHEMA-CT-MIGRATION.md`; flows rewritten to `ct_*`; app data sources repointed. |
| `CreateNewOrderFromInvoice` bypass | **Removed** from hardened flow behavior: see `flows/SQUARE_INVOICE_PAID_HARDENED.md`. Node never calls a “create deposit paid row” without intake. |
| Dual webhooks | Turn off Square → Power Automate URL; optionally keep PA flow as **“called from Node”** with `X-Cheeky-Internal-Secret` for Dataverse-only steps if you want low-code patches. |
| Margin branch still “Deposit Paid” | Move to `DEPOSIT_HELD_OWNER_REVIEW` stage; **do not** set production flags; **do** set `ct_margin_hold = true`; alert founder. |
| No audit | `ct_audit_event` + optional `ct_override_request`; see schemas + alert flow spec. |
| Tiles disagree with Prisma | Tiles use **only** Dataverse fields that Node/flow updates **after** gate; optional **read-only** `GET /api/orders` for compare tools only, not for gallery binding. |

---

## 4. Enforcement layers (bypass resistance)

1. **Process**: All channels write **intake queue** first; “New Order” button → `Patch(ct_intake_queue)` not `ct_orders` final row.
2. **Dataverse**: Optional **classic plugin** (preferred) or **real-time sync flow** on `ct_orders` create: block `ct_deposit_paid = true` unless `ct_intake_correlation_status = GATE_OK` (set only by automation). If plugins unavailable, use **Dataverse business rules** (limited) + **Row-level security** for maker edits on financial fields.
3. **Automation**: Hardened flow **never** creates deposit-paid order; Node is the **only** component that sets production unlock fields after correlation.
4. **Observability**: Every override or failed correlation → `ct_audit_event` + Teams.

---

## 5. Deliverables in this folder

| File / folder | Purpose |
|---------------|---------|
| `connectors/openai-chat-completions-v1.openapi.yaml` | **Primary** — OpenAI Chat Completions (QUOTE_PENDING) |
| `connectors/anthropic-messages-v1.openapi.yaml` | Optional Claude fallback |
| `prompts/CHEEKY_TEES_QUOTE_SYSTEM_PROMPT.md` | Master quote system prompt (JSON-only) |
| `flows/ESTIMATE_CONVERSION_OPENAI.md` | Power Automate + OpenAI wiring |
| `IMPLEMENTATION_SUMMARY_V1.md` | Import steps, env matrix, TS fix strategy |
| `dataverse/ct_intake_queue.schema.json` | Mandatory queue table (draft) |
| `dataverse/ct_audit_event.schema.json` | Audit / bypass log |
| `flows/SQUARE_INVOICE_PAID_HARDENED.md` | Replace legacy PA logic; Node-first alternative |
| `flows/ALERT_AUDIT_EVENT_FLOW.md` | Audit-triggered Teams + email; optional tamper detection flow |
| `POWER_FX_TILES.md` | Tiles + views |
| `IMPORT_TEST_CHECKLIST.md` | Export/import + E2E + bypass tests |
| `GO_LIVE_CHECKLIST.md` | Full import, connector, deploy, adversarial matrix, sign-off |
| `FOUNDER_CHEEKY_OS_V1_LOCKED.md` | One-page founder briefing (cash loop + stop-doing list) |
| `02-SCHEMA-CT-MIGRATION.md` | crb → ct steps |

**Runtime (Node):** `cheeky-os/services/ctSync.service.js` + `src/webhooks/squareWebhook.js`; `cheeky-os/services/openaiQuoteIntake.service.js` + `routes/intakeQuote.route.js`; `cheeky-os/data/dataverse-store.js` `odataRequest`.

---

## 6. Implementation order (recommended)

1. Re-export live solution from tenant → diff against `CheekyTeesAutomationSolution` (see checklist).
2. Create `ct_intake_queue` + `ct_audit_event` in dev environment; import into solution.
3. Add **OpenAI** custom connector; test QUOTE_PENDING sandbox flow (`flows/ESTIMATE_CONVERSION_OPENAI.md`).
4. Implement **Node → Dataverse upsert** after webhook (extend `dataverse-store.js` or dedicated `ctSync.service.js`) with correlation keys.
5. Disable PA Square HTTP trigger in prod; route Square Dashboard to Node URL only.
6. Rewrite tiles/views per `POWER_FX_TILES.md`.
7. Run `IMPORT_TEST_CHECKLIST.md` including bypass attempts.

---

## Final line

**One loop, one webhook master, one schema target (`ct_`), Prisma as financial SOF, Dataverse as UI mirror — no orphan “Deposit Paid” creates.**
