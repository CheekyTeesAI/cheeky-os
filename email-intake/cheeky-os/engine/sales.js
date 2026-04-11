/**
 * Cheeky OS — Sales engine. Pure logic, no Express.
 * Handles quotes, pipeline, hot leads, deal closing, and invoicing.
 *
 * @module cheeky-os/engine/sales
 */

const { fetchSafe } = require("../utils/fetchSafe");
const { logger } = require("../utils/logger");

/**
 * Build a consistent response object.
 * @param {boolean} ok
 * @param {any} data
 * @param {string|null} error
 */
function buildResponse(ok, data, error) {
  return { ok, data, error: error || null };
}

/**
 * Generate a quick price quote for a customer request.
 * @param {{ customer: string, product: string, quantity: number }} params
 * @returns {{ ok: boolean, data: any, error: string|null }}
 */
function generateQuote(params) {
  const { customer, product, quantity } = params || {};
  if (!customer || !product || !quantity) {
    return buildResponse(false, null, "Missing required fields: customer, product, quantity");
  }

  const basePrice = 12.50; // Base per-unit price
  const discount = quantity >= 50 ? 0.15 : quantity >= 25 ? 0.10 : quantity >= 10 ? 0.05 : 0;
  const unitPrice = basePrice * (1 - discount);
  const total = Math.round(unitPrice * quantity * 100) / 100;

  const quote = {
    id: "Q-" + Date.now().toString(),
    customer,
    product,
    quantity,
    unit_price: unitPrice,
    discount_pct: Math.round(discount * 100),
    total,
    valid_until: new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
    status: "DRAFT",
  };

  logger.info(`[SALES] Quote ${quote.id} generated for ${customer}: $${total}`);
  return buildResponse(true, quote, null);
}

/**
 * Generate a full quote with detailed line items.
 * @param {{ customer: string, items: Array<{ product: string, quantity: number }> }} params
 * @returns {{ ok: boolean, data: any, error: string|null }}
 */
function generateQuoteFull(params) {
  const { customer, items } = params || {};
  if (!customer || !items || items.length === 0) {
    return buildResponse(false, null, "Missing customer or items array");
  }

  const lineItems = items.map((item, idx) => {
    const base = 12.50;
    const disc = item.quantity >= 50 ? 0.15 : item.quantity >= 25 ? 0.10 : 0;
    const unit = base * (1 - disc);
    return {
      line: idx + 1,
      product: item.product,
      quantity: item.quantity,
      unit_price: unit,
      line_total: Math.round(unit * item.quantity * 100) / 100,
    };
  });

  const total = lineItems.reduce((sum, li) => sum + li.line_total, 0);

  return buildResponse(true, {
    id: "QF-" + Date.now().toString(),
    customer,
    line_items: lineItems,
    total: Math.round(total * 100) / 100,
    valid_until: new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
    status: "DRAFT",
  }, null);
}

/**
 * Get the current sales pipeline by fetching orders from the export API.
 * @returns {Promise<{ ok: boolean, data: any, error: string|null }>}
 */
async function getPipeline() {
  const base = process.env.BASE_URL || process.env.API_BASE_URL || "http://localhost:3000";
  const url = base + "/cheeky/data/snapshot";
  const result = await fetchSafe(url);
  if (!result.ok) {
    logger.error(`[SALES] pipeline fetch failed: ${url} | ${result.error}`);
    return buildResponse(false, null, "Failed to fetch orders: " + result.error);
  }

  const orders = (result.data && result.data.data && result.data.data.orders) || result.data?.orders || [];
  const pipeline = {
    total_orders: orders.length,
    total_revenue: orders.reduce((s, o) => s + (o.order_total || 0), 0),
    by_status: {},
  };

  for (const o of orders) {
    const status = o.production_status || "Unknown";
    if (!pipeline.by_status[status]) pipeline.by_status[status] = { count: 0, revenue: 0 };
    pipeline.by_status[status].count++;
    pipeline.by_status[status].revenue += o.order_total || 0;
  }

  return buildResponse(true, pipeline, null);
}

/**
 * Get hot leads — orders with deposits paid, ready for action.
 * @returns {Promise<{ ok: boolean, data: any, error: string|null }>}
 */
async function getHotLeads() {
  const base = process.env.BASE_URL || process.env.API_BASE_URL || "http://localhost:3000";
  const url = base + "/cheeky/data/deals/open";
  const result = await fetchSafe(url);
  if (!result.ok) {
    logger.error(`[SALES] hot leads fetch failed: ${url} | ${result.error}`);
    return buildResponse(false, null, result.error);
  }

  const records = result.data?.data?.records || result.data?.records || [];
  const hot = records.filter((o) => (o.deposit_paid || o.deposit || 0) > 0 && (o.production_status || o.stage || "") === "Pending");

  return buildResponse(true, {
    count: hot.length,
    leads: hot.map((o) => ({
      customer: o.customer_name || o.customerName,
      total: o.order_total || o.total || 0,
      deposit: o.deposit_paid || o.deposit || 0,
      remaining: (o.order_total || o.total || 0) - (o.deposit_paid || o.deposit || 0),
    })),
  }, null);
}

/**
 * Close a deal — mark an order as complete (placeholder for Dataverse PATCH).
 * @param {{ customer: string, order_id: string }} params
 * @returns {{ ok: boolean, data: any, error: string|null }}
 */
function closeDeal(params) {
  const { customer, order_id } = params || {};
  if (!customer && !order_id) {
    return buildResponse(false, null, "Provide customer name or order_id");
  }
  logger.info(`[SALES] Deal closed for ${customer || order_id}`);
  return buildResponse(true, {
    customer: customer || null,
    order_id: order_id || null,
    status: "CLOSED",
    closed_at: new Date().toISOString(),
  }, null);
}

/**
 * Create an invoice via Square (or mock if token not set).
 * @param {{ customer: string, email: string, amount: number }} params
 * @returns {Promise<{ ok: boolean, data: any, error: string|null }>}
 */
async function createInvoice(params) {
  const { customer, email, amount } = params || {};
  if (!customer || !amount) {
    return buildResponse(false, null, "Missing customer or amount");
  }

  // If Square is configured, proxy to existing create-invoice endpoint
  const base = process.env.BASE_URL || process.env.API_BASE_URL || "http://localhost:3000";
  if (process.env.SQUARE_ACCESS_TOKEN) {
    const result = await fetchSafe(base + "/cheeky/invoice/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerName: customer, customerEmail: email || "", total: amount }),
    });
    return result.ok
      ? buildResponse(true, result.data, null)
      : buildResponse(false, null, "Invoice creation failed: " + result.error);
  }

  // Mock mode
  logger.info(`[SALES] Mock invoice for ${customer}: $${amount}`);
  return buildResponse(true, {
    invoice_id: "MOCK-" + Date.now(),
    customer,
    amount,
    status: "MOCK_CREATED",
  }, null);
}

module.exports = { generateQuote, generateQuoteFull, getPipeline, getHotLeads, closeDeal, buildResponse, createInvoice };
