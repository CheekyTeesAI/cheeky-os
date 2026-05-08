"use strict";

/**
 * CHEEKY OS v1.0 — Dataverse intake gate + mirror (ct_*).
 *
 * When strict mode is enabled (`isStrictGateEnabled()` — **ON by default in production**
 * if `CHEEKY_CT_INTAKE_GATE_STRICT` is unset):
 * - Square money webhooks MUST find a matching ct_intake_queue row (by Square invoice id)
 *   in allowed stages before processSquareWebhook may apply deposit / production unlock.
 * - No matching intake → reject + ct_audit_event (best effort).
 * - cashToOrder.tryEnsureOrderAfterWebhookNoMatch is skipped (see squareWebhook.js).
 *
 * Env:
 *   CHEEKY_CT_INTAKE_GATE_STRICT=true|false|unset — **unset in production defaults to ON**
 *   (set CHEEKY_CT_INTAKE_GATE_STRICT=false for local dev without Dataverse)
 *   DATAVERSE_URL, DATAVERSE_CLIENT_ID, DATAVERSE_CLIENT_SECRET, DATAVERSE_TENANT_ID
 *   CHEEKY_CT_INTAKE_ENTITY_SET=ct_intake_queues (override if plural differs)
 *   CHEEKY_CT_AUDIT_ENTITY_SET=ct_audit_events
 *   CHEEKY_CT_INTAKE_SQUARE_INVOICE_FIELD=ct_square_invoice_id
 *   CHEEKY_FOUNDER_ALERT_WEBHOOK_URL — optional Teams Incoming Webhook or JSON endpoint on gate failure
 *
 * Production kickoff (after successful mirror) — see productionKickoff.service.js:
 *   CHEEKY_CT_PRODUCTION_KICKOFF=true|false — default true; set false to skip task generation
 *   CHEEKY_CT_INITIAL_PRODUCTION_STAGE — default DEPOSIT_PAID (must match ct_stage_definition.ct_code)
 *   CHEEKY_CT_MIRROR_TASKS_TO_DV — optional POST ct_production_tasks from Prisma tasks
 *   CHEEKY_CT_MIRROR_PROOF_TO_INTAKE — default false; true after intake has ct_proof_* columns
 *   CHEEKY_CT_PRODUCTION_TASK_ENTITY_SET — default ct_production_tasks
 */

const path = require("path");
const { logger } = require("../utils/logger");
const { fetchSafe } = require("../utils/fetchSafe");
const dvStore = require("../data/dataverse-store");
const productionKickoff = require("./productionKickoff.service");
const dvF = require("./dvPublisherColumns.service");

const PAYMENT_EVENT_TYPES = new Set([
  "invoice.payment_made",
  "payment.updated",
  "invoice.updated",
]);

const INTAKE_ENTITY = () => dvF.intakeEntitySet();
const AUDIT_ENTITY = () => dvF.auditEntitySet();
const INTAKE_INVOICE_FIELD = () => dvF.intakeSquareInvoiceField();

function isStrictGateEnabled() {
  const raw = String(process.env.CHEEKY_CT_INTAKE_GATE_STRICT || "").trim().toLowerCase();
  if (raw === "false" || raw === "0" || raw === "off") return false;
  if (raw === "true" || raw === "1" || raw === "on") return true;
  return String(process.env.NODE_ENV || "").trim().toLowerCase() === "production";
}

/**
 * Optional real-time alert (Teams/Copilot webhook or generic JSON listener).
 * Dataverse `ct_audit_event` remains the audit SOF; this is additive.
 */
async function founderWebhookNotify({ title, detail, code, invoiceId }) {
  const url = String(process.env.CHEEKY_FOUNDER_ALERT_WEBHOOK_URL || "").trim();
  if (!url) return { skipped: true };
  const isTeams = /office\.com\/webhook|outlook\.office|microsoftteams\.com/i.test(url);
  const text = [
    "**Cheeky OS — deposit gate**",
    title,
    detail,
    "`code=" + (code || "n/a") + "`",
    "`invoice=" + (invoiceId || "n/a") + "`",
  ].join("\n");
  const body = isTeams
    ? { text }
    : {
        title,
        detail,
        code: code || null,
        invoiceId: invoiceId || null,
        source: "cheeky_ctSync",
        ts: new Date().toISOString(),
      };
  const res = await fetchSafe(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    timeoutMs: 15000,
  });
  if (!res.ok) {
    logger.warn("[ctSync] founder webhook notify failed: " + (res.error || ""));
  }
  return res;
}

function getSquareExtractors() {
  const dist = path.join(__dirname, "..", "..", "dist", "services", "squareWebhookService");
  try {
    return require(dist);
  } catch (e) {
    logger.warn(
      "[ctSync] dist/squareWebhookService missing — using inline extractors (run `npm run build` for parity): " +
        (e && e.message ? e.message : e)
    );
    return null;
  }
}

function asRecord(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : null;
}

function getDataObject(payload) {
  const p = asRecord(payload);
  const data = asRecord(p && p.data);
  const obj = asRecord(data && data.object);
  return obj;
}

/** Fallback when dist is stale or missing — kept in sync with squareWebhookService.ts extractors. */
function extractEventTypeLocal(payload) {
  const p = asRecord(payload);
  if (!p) return null;
  const raw = p.type ?? p.event_type ?? p.eventType;
  return typeof raw === "string" ? raw.trim() : null;
}

function extractInvoiceIdLocal(payload) {
  const obj = getDataObject(payload);
  const inv = asRecord(obj && obj.invoice);
  const raw = (inv && inv.id) ?? (obj && obj.id);
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  const p = asRecord(payload);
  const data = asRecord(p && p.data);
  if (
    data &&
    typeof data.id === "string" &&
    extractEventTypeLocal(payload) === "invoice.updated"
  ) {
    return data.id.trim();
  }
  return null;
}

function extractSquarePaymentIdLocal(payload) {
  const obj = getDataObject(payload);
  const pay = asRecord(obj && obj.payment);
  const raw = pay && (pay.id ?? pay.payment_id);
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function extractSquareOrderIdLocal(payload) {
  const obj = getDataObject(payload);
  const pay = asRecord(obj && obj.payment);
  const inv = asRecord(obj && obj.invoice);
  const raw =
    (pay && (pay.order_id ?? pay.orderId)) ||
    (inv && (inv.order_id ?? inv.orderId)) ||
    (obj && obj.order_id);
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function extractInvoiceNumberLocal(payload) {
  const obj = getDataObject(payload);
  const inv = asRecord(obj && obj.invoice);
  const raw = inv && (inv.invoice_number ?? inv.invoiceNumber);
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function getExtractors() {
  const sw = getSquareExtractors();
  if (sw && typeof sw.extractInvoiceId === "function") return sw;
  return {
    extractInvoiceId: extractInvoiceIdLocal,
    extractEventType: extractEventTypeLocal,
    extractSquarePaymentId: extractSquarePaymentIdLocal,
    extractSquareOrderId: extractSquareOrderIdLocal,
    extractInvoiceNumber: extractInvoiceNumberLocal,
  };
}

function getPrisma() {
  try {
    return require(path.join(__dirname, "..", "..", "src", "lib", "prisma"));
  } catch (_) {
    return null;
  }
}

function odataQuote(str) {
  return `'${String(str || "").replace(/'/g, "''")}'`;
}

function pickFormattedStatus(row) {
  if (!row || typeof row !== "object") return "";
  const sk = dvF.intakeField("status");
  const fvKey = `${sk}@OData.Community.Display.V1.FormattedValue`;
  if (row[fvKey] != null && String(row[fvKey]).trim()) {
    return String(row[fvKey]).trim().toUpperCase();
  }
  const slug = sk.includes("_") ? sk.replace(/^.*_/, "").toLowerCase() : sk.toLowerCase();
  const annotated = Object.keys(row).find((k) => {
    const kl = k.toLowerCase();
    return kl.endsWith("formattedvalue") && slug && kl.includes(slug);
  });
  if (annotated && row[annotated] != null && String(row[annotated]).trim()) {
    return String(row[annotated]).trim().toUpperCase();
  }
  if (row[sk] != null && row[sk] !== "") {
    return String(row[sk]).trim().toUpperCase();
  }
  if (row.ct_status != null && row.ct_status !== "") {
    return String(row.ct_status).trim().toUpperCase();
  }
  return "";
}

const ALLOWED_PREPAID_STATUSES = new Set([
  "INVOICE_SENT",
  "DEPOSIT_PENDING",
  "QUOTE_PENDING",
  "PARSED",
]);

const BLOCKED_INTAKE_STATUSES = new Set(["CANCELED", "BLOCKED", "INTAKE_NEW"]);

/**
 * @param {Record<string, unknown>} row
 */
function intakeAllowsMoneyTransition(row) {
  const st = pickFormattedStatus(row);
  if (BLOCKED_INTAKE_STATUSES.has(st)) return { ok: false, reason: "intake_status_blocked" };
  if (st === "GATE_PASSED") return { ok: true, reason: "already_gate_passed" };
  if (ALLOWED_PREPAID_STATUSES.has(st)) return { ok: true, reason: "allowed_stage" };
  return {
    ok: false,
    reason: st ? `intake_status_not_eligible:${st}` : "intake_status_unreadable",
  };
}

/**
 * @param {string} invoiceId
 * @returns {Promise<{ ok: boolean, rows: any[], error?: string }>}
 */
async function fetchIntakeBySquareInvoice(invoiceId) {
  if (!invoiceId || !invoiceId.trim()) {
    return { ok: true, rows: [], error: null };
  }
  const field = INTAKE_INVOICE_FIELD();
  const filter = `${field} eq ${odataQuote(invoiceId.trim())}`;
  const pathQ = `${INTAKE_ENTITY()}?$filter=${encodeURIComponent(filter)}&$top=10`;
  const res = await dvStore.odataRequest("GET", pathQ, null);
  if (!res.ok) {
    return { ok: false, rows: [], error: res.error || "odata_get_failed" };
  }
  const rows = (res.data && res.data.value) || [];
  return { ok: true, rows, error: null };
}

/**
 * Resolve Square invoice id from payload; if missing, from Prisma order linked by payment/order ids.
 * @param {unknown} payload
 * @returns {Promise<string|null>}
 */
async function resolveInvoiceIdForGate(payload) {
  const sw = getExtractors();
  if (sw && typeof sw.extractInvoiceId === "function") {
    const id = sw.extractInvoiceId(payload);
    if (id && String(id).trim()) return String(id).trim();
  }

  const prisma = getPrisma();
  if (!prisma) return null;

  const payId =
    typeof sw.extractSquarePaymentId === "function"
      ? sw.extractSquarePaymentId(payload)
      : null;
  const sqOrd =
    typeof sw.extractSquareOrderId === "function"
      ? sw.extractSquareOrderId(payload)
      : null;
  const invNum =
    typeof sw.extractInvoiceNumber === "function"
      ? sw.extractInvoiceNumber(payload)
      : null;

  const OR = [];
  if (payId) OR.push({ squareId: payId });
  if (sqOrd) OR.push({ squareOrderId: sqOrd });
  if (invNum) OR.push({ squareInvoiceNumber: invNum });

  if (OR.length === 0) return null;

  const order = await prisma.order.findFirst({
    where: { OR, deletedAt: null },
    select: { squareInvoiceId: true },
  });
  if (order && order.squareInvoiceId && String(order.squareInvoiceId).trim()) {
    return String(order.squareInvoiceId).trim();
  }
  return null;
}

/**
 * Append-only audit row (best effort — table / choices must exist in tenant).
 */
async function writeAuditEvent({
  name,
  message,
  eventType = "CORRELATION_FAIL",
  severity = "CRITICAL",
  invoiceId = null,
  actor = "system:node-ctSync",
  payloadJson = null,
  /** @type {string|null} Optional ct_intake_queue GUID for OData bind */
  relatedIntakeId = null,
}) {
  if (!dvStore.isConfigured()) return { ok: false, skipped: true };

  const body = {
    [dvF.col("name")]: String(name || "CT_SYNC").slice(0, 200),
    [dvF.col("message")]:
      String(message || "").slice(0, 10000) + (invoiceId ? `\ninvoiceId=${invoiceId}` : ""),
  };

  if (payloadJson && String(payloadJson).length < 12000) {
    try {
      body[dvF.col("payload_json")] = String(payloadJson);
    } catch (_) {
      /* optional column */
    }
  }

  try {
    body[dvF.col("event_type")] = eventType;
    body[dvF.col("severity")] = severity;
    body[dvF.col("square_invoice_id")] = invoiceId || undefined;
    body[dvF.col("actor")] = actor;
    const rid = relatedIntakeId != null ? String(relatedIntakeId).trim() : "";
    if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(rid)) {
      body[dvF.intakeLookupBindKey()] = `/${INTAKE_ENTITY()}(${rid})`;
    }
  } catch (_) {}

  const res = await dvStore.odataRequest("POST", AUDIT_ENTITY(), body);
  if (!res.ok) {
    logger.warn(
      "[ctSync] audit write failed (check audit intake columns naming): " + (res.error || "")
    );
  } else {
    try {
      require("./cheekyOsRuntimeObservability.service").noteAuditEventBrief({
        name,
        severity,
        actor,
        at: new Date().toISOString(),
      });
    } catch (_) {}
  }
  return res;
}

async function auditGateFailureAndAlert(audit, code, invoiceId) {
  await writeAuditEvent(audit).catch(() => {});
  await founderWebhookNotify({
    title: audit.name,
    detail: audit.message,
    code,
    invoiceId: invoiceId != null ? invoiceId : audit.invoiceId || null,
  }).catch(() => {});
}

/**
 * Hard gate before Prisma money mutation.
 * @param {unknown} payload — Square webhook JSON
 * @returns {Promise<{ ok: boolean, reason?: string, code?: string, intakeRow?: object }>}
 */
async function assertIntakeQueueGate(payload) {
  if (!isStrictGateEnabled()) {
    return { ok: true, skipped: true, code: "strict_off" };
  }

  if (!dvStore.isConfigured()) {
    const msg =
      "CHEEKY_CT_INTAKE_GATE_STRICT requires Dataverse env (DATAVERSE_URL + app registration)";
    await auditGateFailureAndAlert(
      {
        name: "GATE_CONFIG_FAIL",
        message: msg,
        eventType: "CORRELATION_FAIL",
        severity: "HIGH",
        actor: "system:node-ctSync",
      },
      "dataverse_required",
      null
    );
    return { ok: false, reason: msg, code: "dataverse_required" };
  }

  const sw = getExtractors();
  const et =
    sw && typeof sw.extractEventType === "function"
      ? sw.extractEventType(payload) || "unknown"
      : "unknown";

  if (!PAYMENT_EVENT_TYPES.has(et)) {
    return { ok: true, skipped: true, code: "non_money_event" };
  }

  const invoiceId = await resolveInvoiceIdForGate(payload);
  if (!invoiceId) {
    const msg =
      "Strict intake gate: cannot resolve Square invoice id from webhook or Prisma order";
    await auditGateFailureAndAlert(
      {
        name: "INTAKE_GATE_NO_INVOICE_ID",
        message: msg,
        eventType: "CORRELATION_FAIL",
        severity: "HIGH",
        invoiceId: null,
        payloadJson: safeJson(payload),
        actor: "system:node-ctSync",
      },
      "no_invoice_id",
      null
    );
    return { ok: false, reason: msg, code: "no_invoice_id" };
  }

  const { ok, rows, error } = await fetchIntakeBySquareInvoice(invoiceId);
  if (!ok) {
    const msg = "Dataverse intake lookup failed: " + (error || "unknown");
    await auditGateFailureAndAlert(
      {
        name: "INTAKE_GATE_DV_ERROR",
        message: msg,
        eventType: "CORRELATION_FAIL",
        severity: "HIGH",
        invoiceId,
        actor: "system:node-ctSync",
      },
      "dv_lookup_error",
      invoiceId
    );
    return { ok: false, reason: msg, code: "dv_lookup_error" };
  }

  if (!rows.length) {
    const msg =
      "Strict intake gate: no ct_intake_queue row with ct_square_invoice_id=" + invoiceId;
    await auditGateFailureAndAlert(
      {
        name: "INTAKE_GATE_NO_ROW",
        message: msg,
        eventType: "CORRELATION_FAIL",
        severity: "CRITICAL",
        invoiceId,
        payloadJson: safeJson(payload),
        actor: "system:node-ctSync",
      },
      "no_intake_row",
      invoiceId
    );
    return { ok: false, reason: msg, code: "no_intake_row" };
  }

  const row = rows[0];
  const stageCheck = intakeAllowsMoneyTransition(row);
  if (!stageCheck.ok) {
    const msg =
      "Strict intake gate: intake row not eligible (" + stageCheck.reason + ")";
    await auditGateFailureAndAlert(
      {
        name: "INTAKE_GATE_BAD_STAGE",
        message: msg,
        eventType: "CORRELATION_FAIL",
        severity: "HIGH",
        invoiceId,
        payloadJson: safeJson({ stageCheck, row: pickIntakeSnapshot(row) }),
        actor: "system:node-ctSync",
      },
      stageCheck.reason,
      invoiceId
    );
    return { ok: false, reason: msg, code: stageCheck.reason, intakeRow: row };
  }

  const depPk = dvF.intakeField("deposit_paid");
  const dep =
    row[depPk] === true ||
    row.ct_deposit_paid === true ||
    row.cr2d1_depositpaid === true ||
    row.ct_depositpaid === true;
  if (dep && stageCheck.reason === "already_gate_passed") {
    return { ok: true, code: "idempotent_intake_already_paid", intakeRow: row };
  }

  return { ok: true, code: "gate_ok", intakeRow: row, invoiceId };
}

function pickIntakeSnapshot(row) {
  if (!row || typeof row !== "object") return {};
  return {
    id: dvF.pickIntakeRowId(row),
    status: pickFormattedStatus(row),
    invoice: row[INTAKE_INVOICE_FIELD()],
  };
}

function safeJson(obj) {
  try {
    return JSON.stringify(obj).slice(0, 8000);
  } catch (_) {
    return "{}";
  }
}

/**
 * PATCH intake queue after Prisma successfully applied deposit (mirror for Power Apps).
 * @param {string} orderId — Prisma Order.id
 */
async function mirrorDepositToDataverse(orderId) {
  const skip =
    String(process.env.CHEEKY_CT_MIRROR_AFTER_WEBHOOK || "true").toLowerCase() ===
    "false";
  if (skip || !dvStore.isConfigured() || !orderId) {
    return { ok: true, skipped: true };
  }

  const prisma = getPrisma();
  if (!prisma) return { ok: false, error: "no_prisma" };

  const order = await prisma.order.findFirst({
    where: { id: orderId, deletedAt: null },
    select: {
      id: true,
      squareInvoiceId: true,
      depositPaidAt: true,
      depositPaid: true,
      depositReceived: true,
      depositStatus: true,
      status: true,
      proofStatus: true,
      proofSentAt: true,
    },
  });
  if (!order || !order.squareInvoiceId) {
    return { ok: true, skipped: true, reason: "no_square_invoice_on_order" };
  }

  const depositCaptured =
    Boolean(order.depositPaidAt) ||
    order.depositPaid === true ||
    order.depositReceived === true ||
    String(order.depositStatus || "").toUpperCase() === "PAID";
  const st = String(order.status || "").toUpperCase();
  const statusPaid = st === "DEPOSIT_PAID" || st === "PAID_IN_FULL";
  if (!depositCaptured && !statusPaid) {
    return { ok: true, skipped: true, reason: "prisma_deposit_not_applied_yet" };
  }

  const { rows, ok, error } = await fetchIntakeBySquareInvoice(order.squareInvoiceId);
  if (!ok) return { ok: false, error };

  if (!rows.length) {
    await writeAuditEvent({
      name: "MIRROR_SKIP_NO_INTAKE",
      message:
        "Prisma deposit applied but no Dataverse intake row for invoice " +
        order.squareInvoiceId,
      eventType: "NODE_SYNC",
      severity: "WARN",
      invoiceId: order.squareInvoiceId,
      actor: "system:node-ctSync",
    }).catch(() => {});
    return { ok: true, skipped: true, reason: "no_intake_mirror" };
  }

  const intakeId = dvF.pickIntakeRowId(rows[0]);
  if (!intakeId) return { ok: false, error: "missing_intake_pk" };

  const patch = {
    [dvF.intakeField("deposit_paid")]: true,
    [dvF.intakeField("status")]: "GATE_PASSED",
    [dvF.intakeField("prisma_order_id")]: String(order.id),
  };
  const mirrorProof = ["true", "1", "on"].includes(
    String(process.env.CHEEKY_CT_MIRROR_PROOF_TO_INTAKE || "").toLowerCase()
  );
  if (mirrorProof) {
    if (order.proofStatus != null && String(order.proofStatus).trim()) {
      patch[dvF.intakeField("proof_status")] = String(order.proofStatus).trim().toUpperCase();
    }
    if (order.proofSentAt) {
      patch[dvF.intakeField("proof_sent_at")] = order.proofSentAt.toISOString();
    }
  }

  const key = intakeId;
  let res = await dvStore.odataRequest(
    "PATCH",
    `${INTAKE_ENTITY()}(${key})`,
    patch
  );

  if (!res.ok) {
    const fallback = {
      [dvF.intakeField("deposit_paid")]: true,
      [dvF.intakeField("prisma_order_id")]: String(order.id),
    };
    res = await dvStore.odataRequest(
      "PATCH",
      `${INTAKE_ENTITY()}(${key})`,
      fallback
    );
  }

  if (!res.ok) {
    logger.warn("[ctSync] mirror PATCH failed: " + (res.error || ""));
    return res;
  }

  try {
    const ko = await productionKickoff.runProductionKickoffAfterMirror({
      orderId: String(order.id),
      dataverseIntakeId: String(intakeId),
    });
    if (!ko.ok && !ko.skipped) {
      logger.warn("[ctSync] productionKickoff: " + (ko.error || "failed"));
    }
  } catch (e) {
    logger.warn(
      "[ctSync] productionKickoff exception: " + (e && e.message ? e.message : e)
    );
  }
  return res;
}

module.exports = {
  isStrictGateEnabled,
  assertIntakeQueueGate,
  mirrorDepositToDataverse,
  writeAuditEvent,
  founderWebhookNotify,
  auditGateFailureAndAlert,
  fetchIntakeBySquareInvoice,
  resolveInvoiceIdForGate,
  PAYMENT_EVENT_TYPES,
};
