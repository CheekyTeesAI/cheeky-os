"use strict";

const store = require("./qc.store");

/**
 * Completion gate: QC → COMPLETED requires PASS or OVERRIDE_PASS on latest check.
 * @param {string} orderId
 * @returns {Promise<{ ok: boolean, error?: string, detail?: object }>}
 */
async function assertMayCompleteOrder(orderId) {
  const oid = String(orderId || "").trim();
  if (!oid) return { ok: false, error: "order_id_required" };

  const openPending = store.findOpenPendingForOrder(oid);
  if (openPending) {
    return {
      ok: false,
      error: "qc_pending_incomplete",
      detail: { checkId: openPending.id, hint: "Finish QC (PASS/FAIL/OVERRIDE) before completing order" },
    };
  }

  const latest = store.getLatestCheckForOrder(oid);
  const st = latest ? String(latest.status || "").toUpperCase() : "";

  if (st === "PASS" || st === "OVERRIDE_PASS") {
    return { ok: true, detail: { checkId: latest.id, status: st } };
  }

  if (!latest) {
    return {
      ok: false,
      error: "qc_required_no_record",
      detail: { hint: "Start QC at /qc.html and submit PASS before marking COMPLETED" },
    };
  }

  if (st === "FAIL") {
    return {
      ok: false,
      error: "qc_failed_resolve_first",
      detail: { checkId: latest.id, hint: "Re-run QC after reprint or use OVERRIDE_PASS with documented reason" },
    };
  }

  return {
    ok: false,
    error: "qc_gate_blocked",
    detail: { status: st || "UNKNOWN" },
  };
}

/**
 * On order completion, clear reprint flags.
 * @param {string} orderId
 */
function onOrderMarkedCompleted(orderId) {
  store.resolveReprintPlansForOrder(orderId, "order_completed");
}

module.exports = {
  assertMayCompleteOrder,
  onOrderMarkedCompleted,
};
