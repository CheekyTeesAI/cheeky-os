/**
 * Cheeky OS — Square payment sync engine.
 * Syncs invoice/payment status from Square and marks followups as paid.
 *
 * @module cheeky-os/payments/square-sync
 */

const { fetchSafe } = require("../utils/fetchSafe");
const { logger } = require("../utils/logger");
const { getOpenFollowups, markFollowupStatus } = require("../followup/tracker");
const { matchPaymentToRecord } = require("./matcher");
const { markDealPaid } = require("../data/sync");

const SQUARE_ACCESS_TOKEN = () => process.env.SQUARE_ACCESS_TOKEN || "";
const SQUARE_ENVIRONMENT = () => process.env.SQUARE_ENVIRONMENT || "production";

const PAID_STATUSES = ["paid", "fully_paid", "completed"];

/**
 * Get the Square base URL for the current environment.
 * @returns {string}
 */
function getSquareBaseUrl() {
  return SQUARE_ENVIRONMENT() === "sandbox"
    ? "https://connect.squareupsandbox.com/v2"
    : "https://connect.squareup.com/v2";
}

/**
 * Get authorization headers for Square API requests.
 * @returns {object}
 */
function getHeaders() {
  return {
    Authorization: `Bearer ${SQUARE_ACCESS_TOKEN()}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

/**
 * Sync a single invoice status from Square.
 * Returns mock data if no SQUARE_ACCESS_TOKEN is set.
 *
 * @param {string} invoiceId
 * @returns {Promise<{ ok: boolean, data: object, error: string|null }>}
 */
async function syncInvoiceStatus(invoiceId) {
  if (!SQUARE_ACCESS_TOKEN()) {
    logger.info(`[SQUARE-SYNC] No SQUARE_ACCESS_TOKEN — returning mock for ${invoiceId}`);
    return {
      ok: true,
      data: { mode: "mock", invoiceId, status: "unknown" },
      error: null,
    };
  }

  try {
    const url = `${getSquareBaseUrl()}/invoices/${invoiceId}`;
    const result = await fetchSafe(url, { method: "GET", headers: getHeaders() });

    if (!result.ok) {
      return { ok: false, data: null, error: result.error || "Square API request failed" };
    }

    const raw = result.data;
    const invoice = raw?.invoice || raw;
    const status = invoice?.status || "unknown";

    return {
      ok: true,
      data: { invoiceId, status: status.toLowerCase(), raw },
      error: null,
    };
  } catch (err) {
    logger.error(`[SQUARE-SYNC] syncInvoiceStatus error: ${err.message}`);
    return { ok: false, data: null, error: err.message };
  }
}

/**
 * Sync all tracked open followups that have an invoiceId against Square.
 * Marks paid records as status=paid, stage=closed.
 *
 * @returns {Promise<{ ok: boolean, data: object, error: string|null }>}
 */
async function syncAllTrackedPayments() {
  try {
    const open = getOpenFollowups();
    const withInvoice = open.filter((r) => r.invoiceId);
    const results = [];

    for (const record of withInvoice) {
      const sync = await syncInvoiceStatus(record.invoiceId);
      const previousStatus = record.status;
      let newStatus = previousStatus;

      if (sync.ok && sync.data && PAID_STATUSES.includes(sync.data.status)) {
        markFollowupStatus(record.id, {
          status: "paid",
          stage: "closed",
          paidAt: new Date().toISOString(),
        });
        // Sync to data layer
        try {
          await markDealPaid({ invoiceId: record.invoiceId, amount: record.total, status: "paid" });
        } catch (dlErr) {
          logger.error(`[SQUARE-SYNC] Data layer sync failed: ${dlErr.message}`);
        }
        newStatus = "paid";
        logger.info(`[SQUARE-SYNC] Marked ${record.customerName} (${record.invoiceId}) as paid`);
      }

      results.push({
        id: record.id,
        customerName: record.customerName,
        invoiceId: record.invoiceId,
        previousStatus,
        newStatus,
      });
    }

    return {
      ok: true,
      data: { synced: results.length, results },
      error: null,
    };
  } catch (err) {
    logger.error(`[SQUARE-SYNC] syncAllTrackedPayments error: ${err.message}`);
    return { ok: false, data: null, error: err.message };
  }
}

/**
 * Process a payment event (e.g. from a webhook).
 * Uses matcher to find the corresponding followup record and marks it paid.
 *
 * @param {{ invoiceId?: string, customerEmail?: string, customerName?: string, amount?: number, status?: string }} payment
 * @returns {{ ok: boolean, data: object, error: string|null }}
 */
function processPaymentEvent(payment) {
  try {
    const record = matchPaymentToRecord(payment);

    if (!record) {
      logger.info("[SQUARE-SYNC] processPaymentEvent — no matching record found");
      return { ok: true, data: { matched: false, record: null }, error: null };
    }

    if (PAID_STATUSES.includes((payment.status || "").toLowerCase())) {
      markFollowupStatus(record.id, {
        status: "paid",
        stage: "closed",
        paidAt: new Date().toISOString(),
        paymentAmount: payment.amount || record.total || record.paymentAmount,
      });
      // Sync to data layer
      try {
        markDealPaid({ invoiceId: record.invoiceId || payment.invoiceId, amount: payment.amount || record.total, status: "paid" });
      } catch (dlErr) {
        logger.error(`[SQUARE-SYNC] Data layer sync (event) failed: ${dlErr.message}`);
      }
      logger.info(`[SQUARE-SYNC] Payment event marked ${record.customerName} as paid`);
    }

    return { ok: true, data: { matched: true, record }, error: null };
  } catch (err) {
    logger.error(`[SQUARE-SYNC] processPaymentEvent error: ${err.message}`);
    return { ok: false, data: null, error: err.message };
  }
}

module.exports = {
  getSquareBaseUrl,
  getHeaders,
  syncInvoiceStatus,
  syncAllTrackedPayments,
  processPaymentEvent,
};
