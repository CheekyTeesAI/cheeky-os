# CHEEKY OS v1.0 — Implementation summary (final)

## What was delivered (this repo)

| Area | Artifact |
|------|----------|
| Intake gate + mirror | `email-intake/cheeky-os/services/ctSync.service.js` |
| Webhook integration | `email-intake/src/webhooks/squareWebhook.js` |
| OpenAI quote (Node) | `email-intake/cheeky-os/services/openaiQuoteIntake.service.js` |
| Quote API | `POST /api/cheeky-intake/quote-parse` — `email-intake/cheeky-os/routes/intakeQuote.route.js` |
| Dataverse OData helper | `email-intake/cheeky-os/data/dataverse-store.js` → `odataRequest` |
| OpenAI custom connector | `docs/cheeky-os-v1-unification/connectors/openai-chat-completions-v1.openapi.yaml` |
| Master quote prompt | `docs/cheeky-os-v1-unification/prompts/CHEEKY_TEES_QUOTE_SYSTEM_PROMPT.md` |
| Payment doc | `flows/SQUARE_INVOICE_PAID_HARDENED.md` |
| Estimate flow spec | `flows/ESTIMATE_CONVERSION_OPENAI.md` |
| Go-live | `GO_LIVE_CHECKLIST.md` |
| Founder | `FOUNDER_CHEEKY_OS_V1_LOCKED.md` |

**Claude connector** (`anthropic-messages-v1.openapi.yaml`) remains optional / fallback only.

---

## Import OpenAI connector & wire flows

1. [make.powerapps.com](https://make.powerapps.com) → **Custom connectors** → **New** → OpenAPI 3.0.
2. Upload `openai-chat-completions-v1.openapi.yaml`.
3. **General:** Host `api.openai.com`, base path empty or `/`.
4. **Security:** Bearer — users paste OpenAI **secret** key (scoped key recommended).
5. **Test** tab: run `CreateChatCompletion` with minimal messages + `json_object`.
6. Open **Estimate / QUOTE_PENDING** flow → replace LLM step with **OpenAI connector** per `ESTIMATE_CONVERSION_OPENAI.md`.
7. Ensure invoice step writes **`ct_square_invoice_id`** on the **same** `ct_intake_queue` row and sets **`INVOICE_SENT`**.

---

## Strict gate environment variable

| Variable | Behavior |
|----------|----------|
| `CHEEKY_CT_INTAKE_GATE_STRICT` unset + `NODE_ENV=production` | **Strict ON** — intake row required before deposit applies. |
| `CHEEKY_CT_INTAKE_GATE_STRICT=true` | Strict ON (any environment). |
| `CHEEKY_CT_INTAKE_GATE_STRICT=false` | Strict OFF (local dev, legacy). |

Also set: `DATAVERSE_*`, `SQUARE_WEBHOOK_SIGNATURE_KEY`, `SQUARE_WEBHOOK_NOTIFICATION_URL`, `OPENAI_API_KEY` (for Node quote route).

**Founder alert (optional, immediate):** `CHEEKY_FOUNDER_ALERT_WEBHOOK_URL` — Teams Incoming Webhook or JSON POST; called on **every deposit gate rejection** after `ct_audit_event` write is attempted.

**Node quote API auth (production):** `CHEEKY_INTAKE_QUOTE_API_KEY` — required for `POST /api/cheeky-intake/quote-parse` when `NODE_ENV=production`.

---

## End-to-end test checklist

### Happy path

1. Power Apps: **New Order** → `ct_intake_queue` **INTAKE_NEW** only.
2. Move to **PARSED** / **QUOTE_PENDING** → run OpenAI (connector or `/api/cheeky-intake/quote-parse`) → `ct_parsed_json` filled, `cheeky_quote_v1`.
3. Create/send Square deposit invoice → **`ct_square_invoice_id`** + **INVOICE_SENT**.
4. Pay deposit → Square POST `/api/square/webhook` → Prisma deposit + mirror **GATE_PASSED** / **`ct_deposit_paid`**.
5. Tiles match views (`POWER_FX_TILES.md`).

### Bypass / abuse (must fail or alert)

| Test | Expected |
|------|----------|
| Payment with no intake row (strict ON) | No Prisma deposit unlock; `ct_audit_event`; founder webhook if configured |
| Intake still **INTAKE_NEW** | Gate reject — bad stage |
| Replay webhook `event_id` | Idempotent success, no duplicate jobs |
| `tryEnsureOrderAfterWebhookNoMatch` | **Skipped** when strict ON |
| Manual Dataverse **deposit paid** | Tamper flow / audit (see `ALERT_AUDIT_EVENT_FLOW.md`) |

---

## TypeScript build errors (remaining)

`npm run build` in `email-intake` may still fail due to **Prisma client drift** vs **source** (missing columns, renamed fields, optional `seoAction`, `OrderStatus` enums, social `SocialPost` fields, etc.).

**Fix strategy (in order):**

1. From `email-intake`: `npx prisma generate` after aligning `prisma/schema.prisma` with the database you actually use.
2. Run `npx prisma db pull` **only** if you intend schema file to match DB (then fix breaking renames carefully).
3. Fix or stub modules that reference removed models (`seoAction`, etc.) — remove imports or guard with feature flags.
4. Align `squareWebhookService.ts` `OrderWhereInput` fields (`squarePaymentId`, etc.) with **current** `schema.prisma` `Order` model.

Until `tsc` is clean, ship **`dist/`** from a known-good build artifact **or** run Node entrypoints that only require `cheeky-os` + prebuilt `dist/services/squareWebhookService.js` checked in (not ideal).

---

## Single source of truth

- **Money / webhook pipeline:** Node + Prisma (`processSquareWebhook`).
- **Dashboard tiles:** Dataverse `ct_*` mirrored after gate; no second Square listener in prod.
