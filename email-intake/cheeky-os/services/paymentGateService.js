/**
 * Bundle 11 — pure payment/deposit gate for production moves (no I/O).
 */

/**
 * @param {{
 *   orderId?: string,
 *   status?: string,
 *   paymentStatus?: string,
 *   depositRequired?: boolean,
 *   depositReceived?: boolean,
 *   balanceDue?: number,
 *   notes?: string,
 * }} input
 * @returns {{
 *   allowedToProduce: boolean,
 *   gateStatus: "blocked" | "warning" | "clear",
 *   reason: string,
 *   flags: string[],
 * }}
 */
function evaluatePaymentGate(input) {
  const emptyFlags = () => [];

  try {
    const ps = String(
      input && input.paymentStatus != null ? input.paymentStatus : ""
    )
      .trim()
      .toLowerCase();
    const depReq = input && input.depositRequired === false ? false : true;
    const depRec = input && input.depositReceived === true;

    if (ps === "paid") {
      return {
        allowedToProduce: true,
        gateStatus: "clear",
        reason: "Payment recorded as paid",
        flags: ["ready_for_production"],
      };
    }

    if (depReq && depRec) {
      return {
        allowedToProduce: true,
        gateStatus: "clear",
        reason: "Deposit received",
        flags: ["ready_for_production"],
      };
    }

    if (ps === "not_paid") {
      return {
        allowedToProduce: false,
        gateStatus: "blocked",
        reason: "Payment not received",
        flags: ["deposit_not_received"],
      };
    }

    if (depReq && !depRec) {
      return {
        allowedToProduce: false,
        gateStatus: "blocked",
        reason: "Deposit required but not received",
        flags: ["deposit_not_received"],
      };
    }

    if (!ps) {
      return {
        allowedToProduce: false,
        gateStatus: "warning",
        reason: "Payment status not set — confirm before production",
        flags: ["missing_payment_status"],
      };
    }

    return {
      allowedToProduce: false,
      gateStatus: "warning",
      reason: "Confirm payment or deposit before production",
      flags: ["missing_payment_status"],
    };
  } catch {
    return {
      allowedToProduce: false,
      gateStatus: "warning",
      reason: "Unable to evaluate payment gate",
      flags: emptyFlags(),
    };
  }
}

/** @param {Record<string, unknown>} row */
function captureOrderToGateInput(row) {
  if (!row || typeof row !== "object") {
    return {
      orderId: "",
      status: "",
      paymentStatus: "",
      depositRequired: true,
      depositReceived: false,
      balanceDue: 0,
      notes: "",
    };
  }

  const r = /** @type {Record<string, unknown>} */ (row);
  return {
    orderId: String(r.id != null ? r.id : ""),
    status: String(r.status != null ? r.status : ""),
    paymentStatus: String(r.paymentStatus != null ? r.paymentStatus : ""),
    depositRequired: r.depositRequired === false ? false : true,
    depositReceived: r.depositReceived === true,
    balanceDue:
      typeof r.balanceDue === "number" && Number.isFinite(r.balanceDue)
        ? r.balanceDue
        : 0,
    notes: String(r.paymentNotes != null ? r.paymentNotes : ""),
  };
}

module.exports = { evaluatePaymentGate, captureOrderToGateInput };
