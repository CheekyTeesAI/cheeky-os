/**
 * Bundle 15 — validate automation execute requests (no DB / no AI).
 */

const ALLOWED_TYPES = new Set(["followup", "invoice", "production", "review"]);

/**
 * @param {unknown} v
 * @returns {boolean}
 */
function isApproved(v) {
  if (v === true) return true;
  if (v === 1) return true;
  const s = String(v == null ? "" : v).trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "on";
}

/**
 * @param {unknown} input
 * @returns {{
 *   allowed: boolean,
 *   reason: string,
 *   normalizedAction: { actionType: string, orderId: string, customerId: string }
 * }}
 */
function validateExecution(input) {
  if (!input || typeof input !== "object") {
    return {
      allowed: false,
      reason: "invalid body",
      normalizedAction: { actionType: "", orderId: "", customerId: "" },
    };
  }

  /** @type {{ approved?: unknown, actionType?: unknown, orderId?: unknown, customerId?: unknown, payload?: unknown }} */
  const body = input;

  if (!isApproved(body.approved)) {
    return {
      allowed: false,
      reason: "approval required (approved must be true)",
      normalizedAction: { actionType: "", orderId: "", customerId: "" },
    };
  }

  const actionType = String(body.actionType || "")
    .trim()
    .toLowerCase();
  if (!actionType) {
    return {
      allowed: false,
      reason: "actionType is required",
      normalizedAction: { actionType: "", orderId: "", customerId: "" },
    };
  }
  if (!ALLOWED_TYPES.has(actionType)) {
    return {
      allowed: false,
      reason:
        "invalid actionType (use followup, invoice, production, or review)",
      normalizedAction: { actionType: "", orderId: "", customerId: "" },
    };
  }

  const orderId = String(body.orderId || "").trim();
  const customerIdTop = String(body.customerId || "").trim();
  const payload =
    body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
      ? body.payload
      : {};
  /** @type {{ customerId?: unknown, lineItems?: unknown, amount?: unknown }} */
  const p = payload;
  const customerIdPayload = String(p.customerId || "").trim();
  const customerId = customerIdTop || customerIdPayload;

  if (actionType === "production") {
    if (!orderId) {
      return {
        allowed: false,
        reason: "production requires orderId",
        normalizedAction: { actionType, orderId: "", customerId: "" },
      };
    }
    return {
      allowed: true,
      reason: "",
      normalizedAction: { actionType, orderId, customerId: customerId || "" },
    };
  }

  if (actionType === "invoice") {
    const hasLines =
      Array.isArray(p.lineItems) && p.lineItems.length > 0;
    const amt = Number(p.amount);
    const hasAmount = Number.isFinite(amt) && amt > 0;
    if (!customerId) {
      return {
        allowed: false,
        reason:
          "invoice requires customerId on the request or customerId inside payload",
        normalizedAction: {
          actionType,
          orderId: orderId || "",
          customerId: "",
        },
      };
    }
    if (!hasLines && !hasAmount) {
      return {
        allowed: false,
        reason: "invoice requires payload.amount or non-empty payload.lineItems",
        normalizedAction: { actionType, orderId: orderId || "", customerId },
      };
    }
    return {
      allowed: true,
      reason: "",
      normalizedAction: { actionType, orderId: orderId || "", customerId },
    };
  }

  return {
    allowed: true,
    reason: "",
    normalizedAction: {
      actionType,
      orderId: orderId || "",
      customerId: customerId || "",
    },
  };
}

module.exports = { validateExecution, isApproved };
