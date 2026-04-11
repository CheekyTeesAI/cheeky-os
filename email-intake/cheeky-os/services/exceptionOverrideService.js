/**
 * Bundle 40 — approved founder exceptions unlock specific guarded actions (one use per approval id).
 */

const { getApprovedExceptions } = require("./exceptionQueueService");

/** @type {Set<string>} */
const consumedOverrideIds = new Set();

function normName(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * @param {string} id
 */
function recordOverrideUse(id) {
  const s = String(id || "").trim();
  if (s) consumedOverrideIds.add(s);
}

/**
 * @param {string} id
 * @returns {boolean}
 */
function isOverrideConsumed(id) {
  return consumedOverrideIds.has(String(id || "").trim());
}

/**
 * @param {string} actionType
 * @param {string} exceptionType
 * @returns {boolean}
 */
function actionMatchesExceptionType(actionType, exceptionType) {
  const a = String(actionType || "").toLowerCase();
  const t = String(exceptionType || "").toLowerCase();
  if (a === "pricing_check") return t === "pricing";
  if (a === "production_move") return t === "payment" || t === "production";
  if (a === "invoice_create") return t === "payment";
  if (a === "automation_execute") return t === "automation";
  return false;
}

/**
 * @param {object} ex
 * @param {{
 *   orderId: string,
 *   customerName: string,
 *   exceptionType: string,
 * }} input
 * @returns {boolean}
 */
function matchesOrderOrCustomer(ex, input) {
  const exOid = String(ex.orderId || "").trim();
  const inOid = String(input.orderId || "").trim();
  const exCn = normName(ex.customerName);
  const inCn = normName(input.customerName);

  if (exOid && inOid) {
    return exOid === inOid;
  }
  if (exOid || inOid) {
    return false;
  }
  if (String(input.exceptionType || "").toLowerCase() === "pricing") {
    return exCn.length > 0 && inCn.length > 0 && exCn === inCn;
  }
  return false;
}

/**
 * @param {{
 *   orderId?: string,
 *   customerName?: string,
 *   exceptionType: string,
 *   actionType: string,
 *   reason?: string,
 * }} input
 * @returns {{ overrideAllowed: boolean, reason: string, matchedExceptionId: string }}
 */
function evaluateExceptionOverride(input) {
  try {
    const raw = input && typeof input === "object" ? input : {};
    const exceptionType = String(raw.exceptionType || "").toLowerCase();
    const actionType = String(raw.actionType || "").toLowerCase();
    if (!exceptionType || !actionType) {
      return {
        overrideAllowed: false,
        reason: "Missing exceptionType or actionType",
        matchedExceptionId: "",
      };
    }
    if (!actionMatchesExceptionType(actionType, exceptionType)) {
      return {
        overrideAllowed: false,
        reason: "Action type does not match exception category",
        matchedExceptionId: "",
      };
    }

    const probe = {
      orderId: String(raw.orderId != null ? raw.orderId : "").trim(),
      customerName: String(raw.customerName != null ? raw.customerName : "").trim(),
      exceptionType,
      actionType,
    };

    const approved = getApprovedExceptions();
    for (const ex of approved) {
      if (!ex || ex.status !== "approved") continue;
      if (isOverrideConsumed(ex.id)) continue;
      const exType = String(ex.type || "").toLowerCase();
      if (exType !== exceptionType) continue;
      if (!matchesOrderOrCustomer(ex, probe)) continue;

      return {
        overrideAllowed: true,
        reason: "Founder approved matching exception",
        matchedExceptionId: String(ex.id || ""),
      };
    }

    return {
      overrideAllowed: false,
      reason: "No matching approved exception",
      matchedExceptionId: "",
    };
  } catch {
    return {
      overrideAllowed: false,
      reason: "Override evaluation failed",
      matchedExceptionId: "",
    };
  }
}

module.exports = {
  evaluateExceptionOverride,
  recordOverrideUse,
  isOverrideConsumed,
};
