/**
 * Compatibility wrapper: Square Operator Engine.
 * Reuses existing squareService and reporting service (no refactor).
 */

const squareService = require("./squareService.js");
const squareReportingService = require("./squareReportingService.js");
const memory = require("./memory.js");

async function createDraftInvoice(data) {
  const out = await squareService.createDraftInvoice(data);
  const normalized = {
    success: !!out.success,
    invoiceId: out.invoiceId || out.squareInvoiceId || "",
    status: String(out.status || "DRAFT").toUpperCase() || "DRAFT",
    amount: Number(out.amount || 0),
  };
  if (!normalized.success) {
    return { success: false, error: out.error || "draft invoice failed" };
  }
  if (normalized.status !== "DRAFT") normalized.status = "DRAFT";
  try {
    memory.logDecision(
      "invoice_creation",
      data || {},
      normalized,
      "success",
      "Draft invoice created via Square Operator Engine"
    );
  } catch (_) {
    /* optional */
  }
  return normalized;
}

async function getCustomerOrders(emailOrName) {
  const raw = String(emailOrName || "").trim();
  if (!raw) return [];
  let customerId = raw;
  if (!/^[a-z0-9_-]{8,}$/i.test(raw)) {
    const c = await squareService.getCustomerByName(raw);
    customerId = c && c.id ? String(c.id) : "";
  }
  if (!customerId) return [];
  const orders = await squareReportingService.getOrders({
    start: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
    end: new Date(),
  });
  return (orders || []).filter((o) => String(o.customerId || "") === customerId);
}

async function getOutstandingInvoices() {
  return squareReportingService.getOutstandingInvoices();
}

module.exports = {
  createDraftInvoice,
  getCustomerOrders,
  getOutstandingInvoices,
};
