"use strict";

/**
 * Phase 3 — Square deposit invoice draft (post–AI PARSED) + Dataverse intake deposit mirror from webhooks.
 *
 * Env:
 *   CHEEKY_INTAKE_AUTO_SQUARE_INVOICE=true|false — default true when unset (except MOCK)
 *   CHEEKY_INTAKE_SQUARE_INVOICE_CONFIDENCE_MIN — default 0.75
 *   CHEEKY_INTAKE_SQUARE_DEFAULT_CUSTOMER_ID — optional Square customer GUID (recommended for MVP)
 */

const path = require("path");
const dvStore = require(path.join(__dirname, "..", "data", "dataverse-store"));
const ctSync = require(path.join(__dirname, "ctSync.service"));
const { logger } = require(path.join(__dirname, "..", "utils", "logger"));
const { initializeSquareIntegration } = require(path.join(__dirname, "..", "integrations", "square"));
const { createDraftInvoice } = require(path.join(__dirname, "squareDraftInvoice"));
const dvF = require(path.join(__dirname, "dvPublisherColumns.service"));

const INTAKE_ENTITY = () => dvF.intakeEntitySet();
const INTAKE_INV_FIELD = () => dvF.intakeSquareInvoiceField();

function autoSquareInvoiceEnabled() {
  const r = String(process.env.CHEEKY_INTAKE_AUTO_SQUARE_INVOICE || "").trim().toLowerCase();
  if (r === "false" || r === "0" || r === "off") return false;
  if (String(process.env.USE_MOCK || "").toLowerCase() === "true") return false;
  return true;
}

function minConfidence() {
  const m = Number(process.env.CHEEKY_INTAKE_SQUARE_INVOICE_CONFIDENCE_MIN);
  const v = Number.isFinite(m) ? m : 0.75;
  return v > 1 && v <= 100 ? v / 100 : v;
}

function getSquareWebhookHelpers() {
  try {
    return require(path.join(__dirname, "..", "..", "dist", "services", "squareWebhookService"));
  } catch (_) {
    return null;
  }
}

function normalizeConf(c) {
  let x = Number(c);
  if (x > 1 && x <= 100) x /= 100;
  return x;
}

function extractEmail(text) {
  const m = String(text || "").match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return m ? m[0].trim().toLowerCase() : "";
}

/**
 * Prefer env default customer; else stub — caller should set CHEYK… CHEEKY_INTAKE_SQUARE_DEFAULT_CUSTOMER_ID in prod.
 */
function resolveSquareCustomerId(contactInfo, customerName) {
  const fallback = String(
    process.env.CHEEKY_INTAKE_SQUARE_DEFAULT_CUSTOMER_ID || ""
  ).trim();
  if (fallback) return { ok: true, customerId: fallback };

  const email = extractEmail(contactInfo);
  logger.warn(
    "[intakeSquareBridge] No CHEEKY_INTAKE_SQUARE_DEFAULT_CUSTOMER_ID and no parseable email — set env or enrich intake contact fields with email."
  );
  return {
    ok: false,
    error: email ? "square_customer_resolve_not_implemented_use_default_env" : "no_email_for_square_customer",
  };
}

async function patchIntakeFields(intakeGuid, body) {
  const guid = String(intakeGuid || "").trim();
  return dvStore.odataRequest("PATCH", `${INTAKE_ENTITY()}(${guid})`, body, null, {
    timeoutMs: 25000,
  });
}

/**
 * After AI PARSED + high confidence: create Square draft invoice & link to intake row.
 * @returns {Promise<object>}
 */
async function maybeCreateSquareInvoiceDraftAfterBrainParse({
  intakeGuid,
  dvStatus,
  parsed,
  ct_contact_info,
  ct_customer_name,
  existingSquareInvoiceId,
}) {
  if (!autoSquareInvoiceEnabled()) {
    return { skipped: true, reason: "CHEEKY_INTAKE_AUTO_SQUARE_INVOICE off or USE_MOCK" };
  }
  if (!String(process.env.SQUARE_ACCESS_TOKEN || "").trim()) {
    return { skipped: true, reason: "SQUARE_ACCESS_TOKEN unset" };
  }
  if (dvStatus !== "AI_PARSED" || !parsed || typeof parsed !== "object") {
    return { skipped: true, reason: "not_AI_PARSED" };
  }

  let conf = normalizeConf(parsed.confidence);
  if (!Number.isFinite(conf) || conf < minConfidence()) {
    return { skipped: true, reason: `below_confidence_min want>=${minConfidence()} got=${conf}` };
  }

  if (
    existingSquareInvoiceId &&
    String(existingSquareInvoiceId).trim()
  ) {
    return { skipped: true, reason: "ct_square_invoice_id_already_set" };
  }

  const custRes = resolveSquareCustomerId(
    ct_contact_info,
    ct_customer_name != null ? String(ct_customer_name) : ""
  );
  if (!custRes.ok || !custRes.customerId) {
    return {
      skipped: false,
      ok: false,
      error: custRes.error || "no_square_customer_id",
    };
  }

  const qty = Math.max(1, Math.floor(Number(parsed.qty) || 1));
  const unit = Number(parsed.recommended_price);
  if (!Number.isFinite(unit) || unit <= 0) {
    return { ok: false, error: "invalid_recommended_price" };
  }

  const nm = `${qty}× ${String(parsed.garment || "Garment").slice(0, 80)} (${String(parsed.method || "")})`;

  await initializeSquareIntegration();
  let invOut;
  try {
    invOut = await createDraftInvoice({
      customerId: custRes.customerId,
      lineItems: [{ name: nm, quantity: qty, price: unit }],
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  if (!invOut.success || !invOut.invoiceId) {
    await ctSync
      .writeAuditEvent({
        name: "INTAKE_SQUARE_DRAFT_FAIL",
        message: String(invOut.error || "square_draft_failed").slice(0, 3900),
        eventType: "NODE_SYNC",
        severity: "WARN",
        actor: "system:intake-square-bridge",
        relatedIntakeId: intakeGuid,
        payloadJson: JSON.stringify({ intake_id: intakeGuid }).slice(0, 4000),
      })
      .catch(() => {});
    return {
      ok: false,
      error: invOut.error || "square_draft_failed",
    };
  }

  const invoiceId = String(invOut.invoiceId).trim();
  const field = INTAKE_INV_FIELD();
  const patchBody = {
    [dvF.intakeField("status")]: "INVOICE_SENT",
    [field]: invoiceId.slice(0, 120),
  };

  const p = await patchIntakeFields(intakeGuid, patchBody);
  if (!p.ok) {
    logger.error("[intakeSquareBridge] PATCH invoice id failed: " + (p.error || ""));
    return {
      ok: false,
      error: "dataverse_patch_after_square_failed:" + String(p.error || ""),
      square_invoice_id: invoiceId,
    };
  }

  await ctSync
    .writeAuditEvent({
      name: "INTAKE_SQUARE_DRAFT_CREATED",
      message: `Square draft invoice=${invoiceId} linked to intake`,
      eventType: "NODE_SYNC",
      severity: "INFO",
      actor: "system:intake-square-bridge",
      relatedIntakeId: intakeGuid,
      invoiceId,
      payloadJson: JSON.stringify({
        intake_id: intakeGuid,
        invoice_id: invoiceId,
      }).slice(0, 8000),
    })
    .catch(() => {});

  return {
    ok: true,
    square_invoice_id: invoiceId,
    square_status: invOut.status || "DRAFT",
    intake_status_written: "INVOICE_SENT",
  };
}

/**
 * When Square reports money collected toward an invoice, mirror to ct_intake_queue rows keyed by invoice id.
 * @returns {Promise<{ ok: boolean, rows?: number, error?: string }>}
 */
async function tryMirrorIntakeDepositFromWebhookPayload(payload) {
  if (!dvStore.isConfigured()) {
    return { ok: false, error: "dataverse_not_configured" };
  }

  const sw = getSquareWebhookHelpers();
  if (!sw || typeof sw.extractEventType !== "function") {
    logger.warn("[intakeSquareBridge] dist/squareWebhookService missing — run npm run build in email-intake");
    return { ok: false, error: "square_webhook_helpers_missing" };
  }

  const eventType = sw.extractEventType(payload) || "";
  const allowedTypes = new Set([
    "payment.updated",
    "invoice.updated",
    "invoice.payment_made",
  ]);
  if (!allowedTypes.has(eventType)) return { ok: true, rows: 0 };

  let moneySignal = false;
  if (eventType === "payment.updated") {
    const amt =
      typeof sw.extractPaymentAmountDollars === "function"
        ? sw.extractPaymentAmountDollars(payload)
        : null;
    const pic =
      typeof sw.paymentIndicatesMoneyCollected === "function"
        ? sw.paymentIndicatesMoneyCollected(payload)
        : false;
    moneySignal =
      pic &&
      amt != null &&
      Number(amt) > 0;
  } else if (
    eventType === "invoice.updated" ||
    eventType === "invoice.payment_made"
  ) {
    const invPaid =
      typeof sw.extractInvoiceAmountPaidDollars === "function"
        ? sw.extractInvoiceAmountPaidDollars(payload)
        : null;
    moneySignal = invPaid != null && Number(invPaid) > 0;
  }

  if (!moneySignal) return { ok: true, rows: 0 };

  const invoiceId =
    typeof sw.extractInvoiceId === "function" ? sw.extractInvoiceId(payload) : null;
  if (!invoiceId || !invoiceId.trim()) return { ok: true, rows: 0 };

  const got = await ctSync.fetchIntakeBySquareInvoice(invoiceId.trim());
  if (!got.ok) return { ok: false, error: got.error };

  let n = 0;
  const field = INTAKE_INV_FIELD();

  for (const row of got.rows || []) {
    const id = dvF.pickIntakeRowId(row);
    if (!id || typeof id !== "string") continue;

    const patch = {
      [dvF.intakeField("deposit_paid")]: true,
      [dvF.intakeField("status")]: String(process.env.CHEEKY_CT_STATUS_DEPOSIT_PAID_LABEL || "DEPOSIT_PAID").trim(),
    };

    const pr = await patchIntakeFields(id, patch);
    if (!pr.ok) {
      logger.warn("[intakeSquareBridge] deposit mirror PATCH failed " + id + " " + (pr.error || ""));
      continue;
    }
    n += 1;

    await ctSync
      .writeAuditEvent({
        name: "INTAKE_DEPOSIT_MIRRORED_FROM_SQUARE",
        message: `event=${eventType} invoice=${invoiceId}`,
        eventType: "NODE_SYNC",
        severity: "INFO",
        actor: "system:intake-square-bridge",
        relatedIntakeId: id,
        invoiceId,
        payloadJson: JSON.stringify({ intake_id: id, invoice_id: invoiceId }).slice(0, 6000),
      })
      .catch(() => {});
  }

  return { ok: true, rows: n };
}

module.exports = {
  maybeCreateSquareInvoiceDraftAfterBrainParse,
  tryMirrorIntakeDepositFromWebhookPayload,
};
