"use strict";

/**
 * Square Sync — Core Service
 * Handles manual sync, reconciliation, status reporting, and webhook event processing.
 *
 * IRON LAWS:
 *   - Never fake payment status
 *   - Fail closed on all ambiguity
 *   - Never send emails, SMS, invoices
 *   - Never auto-trigger production
 *   - Square is the financial source of truth
 */

const path = require("path");
const {
  normalizeManualPayload,
  normalizeSquarePayment,
  normalizeSquareInvoice,
  determinePaymentStatus,
  determineDepositStatus,
  determineProductionEligibility,
  summarizeSquareEvent,
  PAYMENT_STATUSES,
} = require("./squareSync.mapper");

const {
  evaluateSyncRecord,
  canUpdatePaymentStatus,
  canMarkDepositPaid,
} = require("./squareSync.guardrails");

const { writeSyncAudit, readSyncAudit } = require("./squareSync.audit");

// ─────────────────────────────────────────────────────────────────────────────
// Prisma helper
// ─────────────────────────────────────────────────────────────────────────────

function getPrisma() {
  try {
    return require(path.join(__dirname, "..", "src", "lib", "prisma"));
  } catch (_) {
    return null;
  }
}

async function safeCall(label, fn, fallback) {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[square-sync] ${label}:`, err && err.message ? err.message : err);
    return fallback;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Order Matching
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find a matching local order for a normalized sync record.
 * Tries: orderId → squareInvoiceId → squareOrderId → squarePaymentId
 * Weak match (name/email) is flagged but not auto-applied.
 * @param {object} normalized
 * @returns {Promise<{order: object|null, matchType: string}>}
 */
async function findMatchingOrder(normalized) {
  const prisma = getPrisma();
  if (!prisma) return { order: null, matchType: "no_db" };

  const select = {
    id: true,
    customerName: true,
    email: true,
    status: true,
    totalAmount: true,
    amountTotal: true,
    amountPaid: true,
    depositPaid: true,
    depositReceived: true,
    depositStatus: true,
    squareInvoiceId: true,
    squarePaymentStatus: true,
    squareInvoiceStatus: true,
    squareOrderId: true,
    squareId: true,
    notes: true,
  };

  // 1. Direct orderId
  if (normalized.orderId) {
    const order = await safeCall("findById", () =>
      prisma.order.findUnique({ where: { id: normalized.orderId }, select })
    , null);
    if (order) return { order, matchType: "orderId" };
  }

  // 2. Square invoice ID
  if (normalized.squareInvoiceId) {
    const order = await safeCall("findByInvoiceId", () =>
      prisma.order.findFirst({ where: { squareInvoiceId: normalized.squareInvoiceId }, select })
    , null);
    if (order) return { order, matchType: "squareInvoiceId" };
  }

  // 3. Square order ID
  if (normalized.squareOrderId) {
    const order = await safeCall("findBySquareOrderId", () =>
      prisma.order.findFirst({ where: { squareOrderId: normalized.squareOrderId }, select })
    , null);
    if (order) return { order, matchType: "squareOrderId" };
  }

  // 4. squareId (unique)
  if (normalized.squarePaymentId) {
    const order = await safeCall("findBySquareId", () =>
      prisma.order.findFirst({ where: { squareId: normalized.squarePaymentId }, select })
    , null);
    if (order) return { order, matchType: "squarePaymentId" };
  }

  return { order: null, matchType: "no_match" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Order Update
// ─────────────────────────────────────────────────────────────────────────────

// Map of safe fields we can update — only fields we know exist on the Order model
const SAFE_PAYMENT_FIELDS = [
  "amountPaid",
  "squarePaymentStatus",
  "squareInvoiceStatus",
  "squareInvoiceId",
  "squareOrderId",
  "depositPaid",
  "depositReceived",
  "depositStatus",
];

/**
 * Build a safe update payload, only including fields we have values for.
 * @param {object} order - Current order from DB
 * @param {object} normalized - Normalized sync record
 * @returns {object} Prisma update data
 */
function buildUpdateData(order, normalized) {
  const data = {};

  // amountPaid: only update if new value is >= existing (never reduce via sync)
  const existingPaid = Number(order.amountPaid || 0);
  const newPaid = Number(normalized.amountPaid || 0);
  if (newPaid > existingPaid) {
    data.amountPaid = newPaid;
  } else if (newPaid > 0 && existingPaid === 0) {
    data.amountPaid = newPaid;
  }

  // squarePaymentStatus
  if (normalized.paymentStatus && normalized.paymentStatus !== PAYMENT_STATUSES.UNKNOWN) {
    data.squarePaymentStatus = normalized.paymentStatus;
  }

  // squareInvoiceStatus
  if (normalized.squareInvoiceStatus) {
    data.squareInvoiceStatus = normalized.squareInvoiceStatus;
  }

  // squareInvoiceId — only set if not already set or matches
  if (normalized.squareInvoiceId && !order.squareInvoiceId) {
    data.squareInvoiceId = normalized.squareInvoiceId;
  }

  // squareOrderId
  if (normalized.squareOrderId && !order.squareOrderId) {
    data.squareOrderId = normalized.squareOrderId;
  }

  // depositPaid / depositReceived / depositStatus
  const canDeposit = canMarkDepositPaid(normalized);
  if (canDeposit.allowed) {
    if (!order.depositPaid) data.depositPaid = true;
    if (!order.depositReceived) data.depositReceived = true;
    // Map to Prisma enum
    const currentDeposit = String(order.depositStatus || "NONE");
    if (normalized.depositStatus === "PAID" && currentDeposit !== "PAID") {
      data.depositStatus = "PAID";
    } else if (normalized.depositStatus === "PARTIAL" && currentDeposit === "NONE") {
      data.depositStatus = "PARTIAL";
    }
  }

  return data;
}

/**
 * Update order payment fields safely.
 * @param {object} order
 * @param {object} normalized
 * @returns {Promise<{updated: boolean, fields: string[], error?: string}>}
 */
async function updateOrderPaymentFields(order, normalized) {
  const prisma = getPrisma();
  if (!prisma) return { updated: false, fields: [], error: "Database unavailable." };

  const data = buildUpdateData(order, normalized);
  const fields = Object.keys(data);

  if (fields.length === 0) {
    return { updated: false, fields: [], note: "No fields needed updating." };
  }

  // Append sync note
  const timestamp = new Date().toISOString();
  const syncNote = `[${timestamp}] [square-sync] Payment sync: status=${normalized.paymentStatus}, paid=$${normalized.amountPaid}, deposit=${normalized.depositStatus}`;

  data.notes = (order.notes ? order.notes + "\n" : "") + syncNote;
  data.updatedAt = new Date();

  try {
    await prisma.order.update({
      where: { id: order.id },
      data,
    });
    return { updated: true, fields };
  } catch (err) {
    // If any field fails (schema mismatch), try minimal update
    try {
      const minimalData = {};
      if (data.amountPaid !== undefined) minimalData.amountPaid = data.amountPaid;
      if (data.squarePaymentStatus !== undefined) minimalData.squarePaymentStatus = data.squarePaymentStatus;
      if (Object.keys(minimalData).length > 0) {
        await prisma.order.update({ where: { id: order.id }, data: minimalData });
        return { updated: true, fields: Object.keys(minimalData), note: "Partial update (some fields incompatible)." };
      }
    } catch (_) {}
    return { updated: false, fields: [], error: err && err.message ? err.message : String(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Sync Flow
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Full sync flow: normalize → guardrails → find order → update → audit.
 * @param {object} normalizedRecord
 * @param {string} mode
 * @returns {Promise<object>}
 */
async function syncPaymentToOrder(normalizedRecord, mode) {
  const syncMode = mode || normalizedRecord.source || "unknown";

  // Run guardrails
  const guard = evaluateSyncRecord(normalizedRecord);

  if (!guard.allowed) {
    const { auditId } = await writeSyncAudit({
      mode: syncMode,
      eventType: normalizedRecord.rawEventType || "unknown",
      squarePaymentId: normalizedRecord.squarePaymentId,
      squareInvoiceId: normalizedRecord.squareInvoiceId,
      orderId: normalizedRecord.orderId,
      allowed: false,
      blocked: true,
      riskLevel: guard.riskLevel,
      result: `Blocked: ${guard.reason}`,
      paymentStatus: normalizedRecord.paymentStatus,
      depositStatus: normalizedRecord.depositStatus,
      amountPaid: normalizedRecord.amountPaid,
      amountTotal: normalizedRecord.amountTotal,
      productionEligible: false,
      error: null,
    });

    return {
      ok: false,
      blocked: true,
      reason: guard.reason,
      normalized: normalizedRecord,
      updatedOrder: null,
      auditId,
    };
  }

  // Find matching order
  const { order, matchType } = await findMatchingOrder(normalizedRecord);

  let updateResult = null;
  let orderId = normalizedRecord.orderId || null;

  if (order) {
    orderId = order.id;
    updateResult = await updateOrderPaymentFields(order, normalizedRecord);
  }

  const { auditId } = await writeSyncAudit({
    mode: syncMode,
    eventType: normalizedRecord.rawEventType || "unknown",
    squarePaymentId: normalizedRecord.squarePaymentId,
    squareInvoiceId: normalizedRecord.squareInvoiceId,
    squareOrderId: normalizedRecord.squareOrderId,
    orderId,
    allowed: true,
    blocked: false,
    riskLevel: guard.riskLevel,
    result: order
      ? (updateResult && updateResult.updated ? `Updated order ${orderId}: ${(updateResult.fields || []).join(", ")}` : `Order found but no fields needed update.`)
      : `No matching order found (match type: ${matchType}).`,
    paymentStatus: normalizedRecord.paymentStatus,
    depositStatus: normalizedRecord.depositStatus,
    amountPaid: normalizedRecord.amountPaid,
    amountTotal: normalizedRecord.amountTotal,
    productionEligible: normalizedRecord.productionEligible,
    error: updateResult && updateResult.error ? updateResult.error : null,
  });

  return {
    ok: true,
    mode: syncMode,
    normalized: normalizedRecord,
    guardrails: guard,
    matchType,
    updatedOrder: order ? { id: order.id, customerName: order.customerName, status: order.status } : null,
    updateResult,
    productionEligible: normalizedRecord.productionEligible,
    auditId,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Manual Sync Endpoint Handler
// ─────────────────────────────────────────────────────────────────────────────

async function runManualSync(payload) {
  const normalized = normalizeManualPayload(payload);
  return await syncPaymentToOrder(normalized, "manual");
}

// ─────────────────────────────────────────────────────────────────────────────
// Reconcile
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compare local orders against their Square-linked payment fields and classify them.
 * @param {{limit: number, dryRun: boolean}} options
 * @returns {Promise<object>}
 */
async function reconcileOrders(options) {
  const limit = Math.min(Number((options && options.limit) || 50), 200);
  const dryRun = options && options.dryRun !== false;

  const prisma = getPrisma();
  const warnings = [];

  if (!prisma) {
    return {
      ok: false,
      dryRun,
      error: "Database unavailable.",
      summary: { checked: 0, unpaid: 0, depositPaid: 0, paid: 0, productionEligible: 0, risks: 0 },
      orders: [],
      recommendations: [],
    };
  }

  let orders = [];
  try {
    orders = await prisma.order.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        customerName: true,
        email: true,
        status: true,
        totalAmount: true,
        amountTotal: true,
        amountPaid: true,
        depositPaid: true,
        depositReceived: true,
        depositStatus: true,
        squareInvoiceId: true,
        squareOrderId: true,
        squarePaymentStatus: true,
        squareInvoiceStatus: true,
        squareId: true,
        updatedAt: true,
        createdAt: true,
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
    });
  } catch (err) {
    warnings.push(`Could not load orders: ${err && err.message ? err.message : err}`);
  }

  const PRODUCTION_STAGES = new Set(["READY", "PRINTING", "QC", "PRODUCTION_READY", "PRODUCTION"]);
  const now = Date.now();

  const classified = orders.map((o) => {
    const amountPaid = Number(o.amountPaid || 0);
    const amountTotal = Number(o.totalAmount || o.amountTotal || 0);
    const depositStatus = String(o.depositStatus || "NONE");
    const depositPaid = Boolean(o.depositPaid || o.depositReceived);
    const paymentStatus = determinePaymentStatus({ amountTotal, amountPaid, squareStatus: o.squarePaymentStatus });
    const depositStatusNorm = determineDepositStatus({ amountTotal, amountPaid });
    const productionEligible = depositPaid || depositStatus === "PAID" || (amountPaid > 0 && paymentStatus !== PAYMENT_STATUSES.FAILED && paymentStatus !== PAYMENT_STATUSES.CANCELED);
    const hasSquareInvoice = Boolean(o.squareInvoiceId);
    const isInProduction = PRODUCTION_STAGES.has(o.status);
    const isOverdue = (now - new Date(o.updatedAt || o.createdAt || now).getTime()) > 7 * 24 * 60 * 60 * 1000;

    const risks = [];
    if (isInProduction && !productionEligible) {
      risks.push("In production stage but deposit not verified.");
    }
    if (hasSquareInvoice && amountPaid === 0 && paymentStatus === PAYMENT_STATUSES.UNPAID) {
      risks.push("Has Square invoice but no payment recorded.");
    }
    if (isOverdue && amountPaid === 0) {
      risks.push("Order overdue and unpaid.");
    }

    return {
      id: o.id,
      customerName: o.customerName,
      stage: o.status,
      amountPaid,
      amountTotal,
      depositStatus: depositStatusNorm,
      paymentStatus,
      productionEligible,
      hasSquareInvoice,
      isInProduction,
      isOverdue,
      risks,
    };
  });

  const summary = {
    checked: classified.length,
    unpaid: classified.filter((o) => o.paymentStatus === PAYMENT_STATUSES.UNPAID).length,
    depositPaid: classified.filter((o) => o.depositStatus === "PAID").length,
    paid: classified.filter((o) => o.paymentStatus === PAYMENT_STATUSES.PAID).length,
    productionEligible: classified.filter((o) => o.productionEligible).length,
    risks: classified.filter((o) => o.risks.length > 0).length,
    withSquareInvoice: classified.filter((o) => o.hasSquareInvoice).length,
  };

  const recommendations = [];
  if (summary.risks > 0) {
    recommendations.push(`Review ${summary.risks} order(s) with payment/production risks.`);
  }
  if (summary.unpaid > 0) {
    recommendations.push(`${summary.unpaid} order(s) are unpaid. Follow up or collect deposits.`);
  }
  const unpaidWithInvoice = classified.filter((o) => o.hasSquareInvoice && o.paymentStatus === PAYMENT_STATUSES.UNPAID).length;
  if (unpaidWithInvoice > 0) {
    recommendations.push(`${unpaidWithInvoice} order(s) have Square invoices but no payment. Follow up.`);
  }
  if (summary.depositPaid > 0) {
    recommendations.push(`${summary.depositPaid} order(s) have deposits confirmed. Review for production readiness.`);
  }
  const inProductionUnpaid = classified.filter((o) => o.isInProduction && !o.productionEligible).length;
  if (inProductionUnpaid > 0) {
    recommendations.push(`RISK: ${inProductionUnpaid} order(s) are in production stages without verified deposit.`);
  }

  // Audit the reconcile
  await writeSyncAudit({
    mode: "reconcile",
    eventType: "reconcile",
    allowed: true,
    blocked: false,
    riskLevel: summary.risks > 0 ? "medium" : "low",
    result: `Reconcile: checked=${summary.checked}, unpaid=${summary.unpaid}, risks=${summary.risks}, dryRun=${dryRun}`,
  });

  return {
    ok: true,
    dryRun,
    warnings: warnings.length > 0 ? warnings : undefined,
    summary,
    orders: classified,
    recommendations,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Status Endpoint
// ─────────────────────────────────────────────────────────────────────────────

async function getSquareSyncStatus() {
  const prisma = getPrisma();
  const warnings = [];

  if (!prisma) {
    return {
      ok: true,
      partial: true,
      warnings: ["Database unavailable."],
      timestamp: new Date().toISOString(),
      summary: {
        ordersWithSquareInvoice: 0,
        ordersWithSquarePayment: 0,
        ordersUnpaid: 0,
        ordersDepositPaid: 0,
        ordersFullyPaid: 0,
        ordersProductionEligible: 0,
        ordersBlockedFromProduction: 0,
      },
      risks: [],
      nextActions: [],
    };
  }

  let orders = [];
  try {
    orders = await prisma.order.findMany({
      where: { deletedAt: null, status: { notIn: ["DONE", "CANCELLED", "ARCHIVED"] } },
      select: {
        id: true,
        customerName: true,
        status: true,
        totalAmount: true,
        amountTotal: true,
        amountPaid: true,
        depositPaid: true,
        depositReceived: true,
        depositStatus: true,
        squareInvoiceId: true,
        squarePaymentStatus: true,
        squareInvoiceStatus: true,
        squareOrderId: true,
        squareId: true,
        updatedAt: true,
      },
      take: 500,
    });
  } catch (err) {
    warnings.push(`Orders load failed: ${err && err.message ? err.message : err}`);
  }

  const PRODUCTION_STAGES = new Set(["READY", "PRINTING", "QC", "PRODUCTION_READY", "PRODUCTION"]);

  let withSquareInvoice = 0;
  let withSquarePayment = 0;
  let unpaidCount = 0;
  let depositPaidCount = 0;
  let fullyPaidCount = 0;
  let productionEligibleCount = 0;
  let blockedFromProductionCount = 0;
  const risks = [];

  orders.forEach((o) => {
    const amountPaid = Number(o.amountPaid || 0);
    const amountTotal = Number(o.totalAmount || o.amountTotal || 0);
    const depositPaid = Boolean(o.depositPaid || o.depositReceived);
    const depositStatus = String(o.depositStatus || "NONE");
    const paymentStatus = determinePaymentStatus({ amountTotal, amountPaid, squareStatus: o.squarePaymentStatus });
    const productionEligible = depositPaid || depositStatus === "PAID" || amountPaid > 0;
    const isInProduction = PRODUCTION_STAGES.has(o.status);

    if (o.squareInvoiceId) withSquareInvoice++;
    if (o.squareId || o.squareOrderId) withSquarePayment++;
    if (paymentStatus === PAYMENT_STATUSES.UNPAID) unpaidCount++;
    if (depositStatus === "PAID" || depositPaid) depositPaidCount++;
    if (paymentStatus === PAYMENT_STATUSES.PAID) fullyPaidCount++;
    if (productionEligible) productionEligibleCount++;
    if (isInProduction && !productionEligible) {
      blockedFromProductionCount++;
      risks.push({
        type: "PRODUCTION_WITHOUT_DEPOSIT",
        orderId: o.id,
        customerName: o.customerName,
        stage: o.status,
        message: `${o.customerName} is in ${o.status} but deposit not verified.`,
      });
    }
  });

  const nextActions = [];
  if (unpaidCount > 0) nextActions.push(`Collect payment on ${unpaidCount} unpaid order(s).`);
  if (blockedFromProductionCount > 0) nextActions.push(`URGENT: ${blockedFromProductionCount} order(s) in production without verified deposit.`);
  if (depositPaidCount > 0) nextActions.push(`${depositPaidCount} order(s) have deposits confirmed — review for production.`);
  const unpaidWithInvoice = orders.filter((o) => o.squareInvoiceId && Number(o.amountPaid || 0) === 0).length;
  if (unpaidWithInvoice > 0) nextActions.push(`${unpaidWithInvoice} Square invoice(s) outstanding — follow up.`);

  return {
    ok: true,
    partial: warnings.length > 0,
    warnings: warnings.length > 0 ? warnings : undefined,
    timestamp: new Date().toISOString(),
    squareEnvConfigured: Boolean(process.env.SQUARE_ACCESS_TOKEN && process.env.SQUARE_LOCATION_ID),
    summary: {
      ordersWithSquareInvoice: withSquareInvoice,
      ordersWithSquarePayment: withSquarePayment,
      ordersUnpaid: unpaidCount,
      ordersDepositPaid: depositPaidCount,
      ordersFullyPaid: fullyPaidCount,
      ordersProductionEligible: productionEligibleCount,
      ordersBlockedFromProduction: blockedFromProductionCount,
    },
    risks,
    nextActions,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Webhook Handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle a Square webhook event safely.
 * Normalizes → guardrails → find order → update → audit.
 * Never throws. Always returns a result.
 * @param {object} event - Raw Square webhook body
 * @returns {Promise<object>}
 */
async function handleSquareWebhookEvent(event) {
  if (!event || typeof event !== "object") {
    return { ok: false, reason: "No event data." };
  }

  const eventSummary = summarizeSquareEvent(event);
  const type = eventSummary.type;
  const data = event.data || {};
  const obj = data.object || {};

  let normalized = null;

  try {
    if (type === "payment.created" || type === "payment.updated") {
      normalized = normalizeSquarePayment(obj);
    } else if (
      type === "invoice.payment_made" ||
      type === "invoice.updated" ||
      type === "invoice.created" ||
      type === "invoice.published"
    ) {
      normalized = normalizeSquareInvoice(obj);
    } else if (type === "order.updated") {
      // Order events: extract payment data if available
      const payment = obj.order && obj.order.tenders && obj.order.tenders[0];
      if (payment) {
        normalized = normalizeSquarePayment({ payment });
        if (obj.order && obj.order.id) normalized.squareOrderId = obj.order.id;
      }
    }
  } catch (parseErr) {
    console.warn("[square-sync/webhook] Parse error:", parseErr && parseErr.message ? parseErr.message : parseErr);
  }

  if (!normalized) {
    // Unhandled event type — audit and return
    await writeSyncAudit({
      mode: "webhook",
      eventType: type,
      allowed: false,
      blocked: false,
      riskLevel: "low",
      result: `Unhandled webhook event type: ${type}. No action taken.`,
    });
    return { ok: true, handled: false, eventType: type, reason: "Unhandled event type." };
  }

  const result = await syncPaymentToOrder(normalized, "webhook");
  return { ...result, eventType: type, eventSummary };
}

// ─────────────────────────────────────────────────────────────────────────────
// Context Helper (for Operator Bridge upgrade)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the squareSync summary block for /api/operator/context.
 * @returns {Promise<object>}
 */
async function buildOperatorContextSync() {
  try {
    const status = await getSquareSyncStatus();
    return {
      enabled: true,
      squareEnvConfigured: status.squareEnvConfigured || false,
      ordersWithSquareInvoice: status.summary.ordersWithSquareInvoice,
      ordersUnpaid: status.summary.ordersUnpaid,
      ordersDepositPaid: status.summary.ordersDepositPaid,
      ordersFullyPaid: status.summary.ordersFullyPaid,
      ordersProductionEligible: status.summary.ordersProductionEligible,
      ordersBlockedFromProduction: status.summary.ordersBlockedFromProduction,
      risks: (status.risks || []).slice(0, 10),
      nextActions: status.nextActions || [],
    };
  } catch (err) {
    return {
      enabled: false,
      error: err && err.message ? err.message : String(err),
    };
  }
}

module.exports = {
  runManualSync,
  syncPaymentToOrder,
  findMatchingOrder,
  updateOrderPaymentFields,
  reconcileOrders,
  getSquareSyncStatus,
  handleSquareWebhookEvent,
  buildOperatorContextSync,
  normalizeManualPayload,
};
