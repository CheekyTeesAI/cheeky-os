/**
 * Bundle 26 — rules for controlled auto draft invoices (no Square calls here).
 */

const MIN_AMOUNT = 200;
const RECENT_INTERACTION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * @param {unknown} iso
 * @returns {number}
 */
function parseTime(iso) {
  const t = new Date(iso || "").getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * @param {string} c
 * @returns {c is "low"|"medium"|"high"}
 */
function normConfidence(c) {
  const x = String(c || "").toLowerCase();
  if (x === "high" || x === "medium" || x === "low") return x;
  return "low";
}

/**
 * @param {{
 *   customerName?: string,
 *   customerId?: string,
 *   amount?: unknown,
 *   status?: string,
 *   lastInteraction?: string,
 *   confidence?: string
 * }} input
 * @param {{ hasExistingInvoice?: boolean, alreadyDraftedRecently?: boolean }} [runtime]
 * @returns {{ shouldCreate: boolean, reason: string }}
 */
function evaluateInvoiceAutomation(input, runtime) {
  const rt = runtime && typeof runtime === "object" ? runtime : {};
  const customerId = String((input && input.customerId) || "").trim();
  const amount = Number(input && input.amount);
  const amountOk = Number.isFinite(amount) && amount >= MIN_AMOUNT;
  const confidence = normConfidence(input && input.confidence);
  const lastMs = parseTime(input && input.lastInteraction);
  const recentFollowUp =
    lastMs > 0 && Date.now() - lastMs <= RECENT_INTERACTION_MS;
  const highEnough = confidence === "high" || recentFollowUp;

  if (!customerId) {
    return { shouldCreate: false, reason: "missing_customer_id" };
  }
  if (rt.hasExistingInvoice) {
    return { shouldCreate: false, reason: "invoice_already_exists" };
  }
  if (rt.alreadyDraftedRecently) {
    return { shouldCreate: false, reason: "duplicate_recent_auto_draft" };
  }
  if (!amountOk) {
    return { shouldCreate: false, reason: "amount_below_minimum" };
  }
  if (!highEnough) {
    return {
      shouldCreate: false,
      reason: "confidence_low_and_no_recent_interaction",
    };
  }

  return { shouldCreate: true, reason: "eligible" };
}

module.exports = {
  evaluateInvoiceAutomation,
  MIN_AMOUNT,
  RECENT_INTERACTION_MS,
};
