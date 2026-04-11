/**
 * Cheeky OS — Followup Engine 2.0
 * Tracks invoices, detects stale/hot deals, generates followup messages,
 * and produces daily next-action lists.
 *
 * @module cheeky-os/followup/engine
 */

const {
  saveFollowupRecord,
  getOpenFollowups,
  markFollowupStatus,
} = require("./tracker");

const FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1000;

/**
 * Create a tracked invoice record.
 * @param {{ customerName: string, customerEmail: string, title: string, quantity: number, unitPrice: number, total: number, deposit: number }} payload
 * @returns {object} The created record.
 */
function createTrackedInvoice(payload) {
  const now = new Date().toISOString();
  const record = {
    id: Date.now().toString(),
    customerName: payload.customerName || "Customer",
    customerEmail: payload.customerEmail || null,
    invoiceId: payload.invoiceId || "inv-" + Date.now(),
    total: payload.total || 0,
    deposit: payload.deposit || 0,
    status: "draft",
    stage: "invoiced",
    lastContactAt: now,
    createdAt: now,
    notes: payload.notes || "",
  };
  return saveFollowupRecord(record);
}

/**
 * Generate a followup message for a record.
 * @param {object} record
 * @returns {string}
 */
function generateFollowupMessage(record) {
  const name = record.customerName || "there";

  if (record.status === "hot") {
    return `Hey ${name}, we've got an opening to get this moving quickly if you want to knock the deposit out today.`;
  }

  const lastContact = record.lastContactAt ? new Date(record.lastContactAt).getTime() : 0;
  const isStale = Date.now() - lastContact > FORTY_EIGHT_HOURS;

  if (isStale) {
    return `Hey ${name}, just following up on this so we can lock in production.`;
  }

  if (!record.deposit && record.stage === "invoiced") {
    return `Hey ${name}, just checking in — I sent your invoice over and we can get this started as soon as the deposit comes through.`;
  }

  return `Hey ${name}, just following up on your order. Let me know if you have any questions!`;
}

/**
 * Get stale deals — not paid and last contact older than 48 hours.
 * @returns {Array}
 */
function getStaleDeals() {
  const cutoff = Date.now() - FORTY_EIGHT_HOURS;
  return getOpenFollowups().filter((r) => {
    const last = r.lastContactAt ? new Date(r.lastContactAt).getTime() : 0;
    return last < cutoff;
  });
}

/**
 * Get hot deals — total >= 200, not paid, not closed.
 * @returns {Array}
 */
function getHotDeals() {
  return getOpenFollowups().filter((r) => (r.total || 0) >= 200);
}

/**
 * Run a full followup cycle: find stale deals, generate messages, update records.
 * @returns {{ count: number, messages: Array<{ id: string, customerName: string, message: string, status: string }> }}
 */
function runFollowupCycle() {
  const stale = getStaleDeals();
  const messages = [];

  for (const record of stale) {
    const newStatus = (record.total || 0) >= 200 ? "hot" : record.status;
    const message = generateFollowupMessage({ ...record, status: newStatus });

    markFollowupStatus(record.id, {
      stage: "followed_up",
      lastContactAt: new Date().toISOString(),
      status: newStatus,
    });

    messages.push({
      id: record.id,
      customerName: record.customerName,
      message,
      status: newStatus,
    });
  }

  return { count: messages.length, messages };
}

/**
 * Get next sales actions — top 5, hot first, highest total first.
 * @returns {Array<{ id: string, customerName: string, action: string, reason: string }>}
 */
function getNextSalesActions() {
  const open = getOpenFollowups();

  // Sort: hot first, then by total descending
  open.sort((a, b) => {
    const aHot = a.status === "hot" ? 1 : 0;
    const bHot = b.status === "hot" ? 1 : 0;
    if (bHot !== aHot) return bHot - aHot;
    return (b.total || 0) - (a.total || 0);
  });

  return open.slice(0, 5).map((r) => {
    let action = "send_followup";
    let reason = "Open invoice needs follow-up";

    if (r.status === "hot") {
      action = "close_now";
      reason = `Hot deal — $${r.total} ready to close`;
    } else if (r.stage === "invoiced" && !r.deposit) {
      action = "send_followup";
      reason = "Invoice sent but no deposit yet";
    } else if (r.stage === "quoted") {
      action = "invoice_ready";
      reason = "Quote accepted — send invoice";
    }

    return { id: r.id, customerName: r.customerName, action, reason };
  });
}

module.exports = {
  createTrackedInvoice,
  generateFollowupMessage,
  getStaleDeals,
  getHotDeals,
  runFollowupCycle,
  getNextSalesActions,
};
