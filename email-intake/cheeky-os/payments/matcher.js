/**
 * Cheeky OS — Payment matcher.
 * Matches incoming payment events to tracked followup records.
 *
 * @module cheeky-os/payments/matcher
 */

const { getAllFollowups } = require("../followup/tracker");

/**
 * Normalize a customer name for matching.
 * @param {string} name
 * @returns {string}
 */
function normalizeName(name) {
  if (!name) return "";
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Match a payment event to a tracked followup record.
 * Priority: invoiceId → customerEmail → customerName.
 *
 * @param {{ invoiceId?: string, customerEmail?: string, customerName?: string, amount?: number, status?: string }} payment
 * @returns {object|null} The matched record, or null.
 */
function matchPaymentToRecord(payment) {
  const records = getAllFollowups();

  // 1. Exact invoiceId match
  if (payment.invoiceId) {
    const byInvoice = records.find((r) => r.invoiceId === payment.invoiceId);
    if (byInvoice) return byInvoice;
  }

  // 2. customerEmail match
  if (payment.customerEmail) {
    const email = payment.customerEmail.toLowerCase().trim();
    const byEmail = records.find(
      (r) => r.customerEmail && r.customerEmail.toLowerCase().trim() === email
    );
    if (byEmail) return byEmail;
  }

  // 3. Normalized customerName match
  if (payment.customerName) {
    const normalized = normalizeName(payment.customerName);
    const byName = records.find(
      (r) => normalizeName(r.customerName) === normalized
    );
    if (byName) return byName;
  }

  return null;
}

module.exports = { matchPaymentToRecord, normalizeName };
