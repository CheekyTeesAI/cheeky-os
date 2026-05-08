# Hardened deposit gate — Square payment → Dataverse + Prisma

## Principle

**Power Automate must NOT** receive Square directly in production. **Node** (`POST /api/square/webhook`) is the **only** verifier. After Prisma updates succeed, Node (or a single child flow invoked with **shared secret**) patches Dataverse.

If you **must** keep a Power Automate flow for historical reasons, replace it with: **When HTTP request receives** body from **Node only** (not Square), schema = your internal `CheekyDepositGatePayload`.

---

## Legacy risk removed: `CreateNewOrderFromInvoice`

| Legacy behavior | Hardened behavior |
|-----------------|-------------------|
| If no Dataverse order matches invoice → create row **Deposit Paid** | **Never.** If correlation fails → `ct_audit_event` **CORRELATION_FAIL** + notify; optional create `ct_intake_queue` row **BLOCKED** with `ct_square_invoice_id` for manual linking only — **never** set `ct_deposit_paid`. |

---

## Correlation algorithm (Node — canonical)

1. Parse Square `invoice.id`, `payment`, `order_id` fields per existing `squareWebhook` handler.
2. **Lookup Prisma** `Order` where `squareInvoiceId` / legacy fields match.
3. **Lookup Dataverse** `ct_intake_queue`: filter `ct_square_invoice_id eq '{invoiceId}'` AND `ct_status in ('INVOICE_SENT','DEPOSIT_PENDING')`.
4. **Gate OK** iff (Prisma row exists OR intake row exists) **and** amount/payment state confirms deposit policy (reuse existing deposit math).
5. If **only** Prisma exists: still PATCH intake **or** create intake retroactive row **INTAKE_NEW → INVOICE_SENT** without `ct_deposit_paid` until payment event — then set paid in same transaction batch.
6. **Margin hold** (optional): if margin < 45% → Prisma flag + Dataverse `ct_margin_hold = true`, stage **MARGIN_REVIEW**, **no** `crb_productionjobs` / `ct_production` create.

---

## Power Automate equivalent (only if Node calls it)

**Trigger:** HTTP request (internal).  
**Actions:**

1. **Parse** JSON body: `invoiceId`, `intakeQueueId`, `orderId`, `depositPaid`, `marginHold`, `eventId`, `hmacOk`.
2. **Condition:** `hmacOk` is true AND `internalSecret` header matches Key Vault / env.
3. **Get** `ct_intake_queue` by id (if provided).
4. **Condition:** `depositPaid` AND NOT `marginHold` AND intake status allowed.
5. **Update** `ct_intake_queue`: `ct_deposit_paid = true`, `ct_status = GATE_PASSED`.
6. **Update** `ct_orderses` (if used): link lookup `ct_intakequeueid`, set stage **Production Ready** only if policy says so.
7. **Create** `ct_production` / jobs **only inside this branch**.
8. **Else:** Create `ct_audit_event` CRITICAL with payload.

No branch may **Create** a new `ct_orderses` with deposit paid without passing step 4.

---

## Power Fx (gallery — “Deposit paid?” label)

Use unified fields only:

```powerfx
If(
  ThisItem.ct_deposit_paid && !ThisItem.ct_margin_hold,
  "Funded",
  If(
    ThisItem.ct_margin_hold,
    "Paid — margin hold",
    "Awaiting deposit"
  )
)
```

## View filters (examples)

- **Estimates tile count:** `ct_status in ('QUOTE_PENDING','INVOICE_SENT')` AND `ct_deposit_paid = false`
- **Blanks / production:** `ct_deposit_paid = true` AND `ct_status = 'GATE_PASSED'` AND (your existing garment flags)
- **Never** count rows with `ct_status = 'BLOCKED'` as ready for blanks

---

## Artwork folder flow

Trigger **only** when `ct_status = GATE_PASSED` **and** child condition “art gate ok”. **Do not** trigger on invoice created.

---

## Implemented in this repo (Node path)

### Files

| Piece | Location |
|--------|----------|
| Dataverse OData helper | `email-intake/cheeky-os/data/dataverse-store.js` → `odataRequest()` |
| Intake gate + mirror + audit writes | `email-intake/cheeky-os/services/ctSync.service.js` |
| Pipeline integration | `email-intake/src/webhooks/squareWebhook.js` → `runCanonicalSquareWebhookPipeline()` |

### Request path (production)

1. Square sends **POST** to **`/api/square/webhook`** (or alias `/webhooks/square/webhook`) with **raw body**.
2. `mountCanonicalInvoiceRaw` (`squareWebhook.js`) parses JSON, calls **`verifySquareSignature`** from `dist/services/squareWebhookService` (HMAC per Square docs), using `SQUARE_WEBHOOK_SIGNATURE_KEY` and `SQUARE_WEBHOOK_NOTIFICATION_URL` if behind a proxy.
3. **`runCanonicalSquareWebhookPipeline`** runs:
   - For `invoice.payment_made`, `payment.updated`, `invoice.updated`: if **`CHEEKY_CT_INTAKE_GATE_STRICT=true`**, **`assertIntakeQueueGate`** runs **before** `processSquareWebhook`:
     - Resolves invoice id (`extractInvoiceId` or Prisma fallback by payment / Square order / invoice number).
     - OData **GET** `ct_intake_queues?$filter=ct_square_invoice_id eq '{id}'`.
     - Requires a row in an **allowed** intake stage (not `INTAKE_NEW`, `BLOCKED`, `CANCELED`; `GATE_PASSED` allowed for idempotent retries).
     - On failure: returns `{ success: false, ctGateRejected: true }`, writes **`ct_audit_event`** (when table/columns exist), **does not** mutate Prisma.
   - **`processSquareWebhook`** (`src/services/squareWebhookService.ts`): idempotency via `event_id`, matches Prisma `Order`, applies deposit math and decision engine.
   - If **no Prisma order** match: **`tryEnsureOrderAfterWebhookNoMatch`** is **skipped** when strict mode is on (no silent order create from payment-only webhooks).
   - On **success** with an order id: **`mirrorDepositToDataverse(orderId)`** runs if Prisma shows deposit captured: **PATCH** intake `ct_deposit_paid`, `ct_status=GATE_PASSED`, `ct_prisma_order_id`.

### Environment variables

| Variable | Purpose |
|----------|---------|
| `CHEEKY_CT_INTAKE_GATE_STRICT=true` | **Mandatory loop** in production: intake row required before money mutation. |
| `DATAVERSE_URL`, `DATAVERSE_CLIENT_ID`, `DATAVERSE_CLIENT_SECRET`, `DATAVERSE_TENANT_ID` | Dataverse Web API (same as existing store). |
| `CHEEKY_CT_INTAKE_ENTITY_SET` | Default `ct_intake_queues`. |
| `CHEEKY_CT_AUDIT_ENTITY_SET` | Default `ct_audit_events`. |
| `CHEEKY_CT_INTAKE_SQUARE_INVOICE_FIELD` | Default `ct_square_invoice_id`. |
| `CHEEKY_CT_MIRROR_AFTER_WEBHOOK=false` | Disable mirror PATCH (debug only). |

### Build

`ctSync` prefers **`dist/services/squareWebhookService`** when present (run `npm run build` after TS is clean).

If `dist` is missing or unloadable, **`ctSync` falls back to inline JavaScript extractors** aligned with the same webhook shape so the intake gate still runs. **`processSquareWebhook`** still loads from `dist` via `squareWebhook.js` — fixing the full `tsc` build remains required for end-to-end webhook processing.

### Correlation vs earlier doc

Strict mode requires a **Dataverse intake** row with the Square **invoice id**; “Prisma-only” match is **not** enough to pass the gate. Prisma fallback is used only to **resolve** the invoice id when the webhook body omits it. All channels must **`Patch`/create intake** and set **`ct_square_invoice_id`** when the deposit invoice is issued.
