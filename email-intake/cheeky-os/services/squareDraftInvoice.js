/**
 * Bundle 2 — manual draft invoice only (no publish / no email send).
 * Uses same fetch + env pattern as integrations/square.js without modifying that module.
 */

const {
  initializeSquareIntegration,
  getSquareIntegrationStatus,
  getSquareRuntimeConfig,
  getBaseUrl,
} = require("../integrations/square");
const { logger } = require("../utils/logger");

/**
 * @param {{ customerId: string, lineItems: Array<{ name?: string, quantity?: number, price?: number }> }} body
 * @returns {Promise<{ success: boolean, invoiceId?: string, status?: string, error?: string }>}
 */
async function createDraftInvoice(body) {
  const customerId = safeTrim(body && body.customerId);
  const lineItems = Array.isArray(body && body.lineItems) ? body.lineItems : [];

  if (!customerId) {
    return { success: false, error: "customerId is required" };
  }
  if (lineItems.length === 0) {
    return { success: false, error: "lineItems must be a non-empty array" };
  }

  await initializeSquareIntegration();
  const cfg = getSquareRuntimeConfig();
  const token = cfg && cfg.token;
  const status = getSquareIntegrationStatus();
  const locationId = status.location && status.location.id;

  if (!token || !locationId) {
    return {
      success: false,
      error: "Square not configured or no location — check token and SQUARE_LOCATION_ID",
    };
  }

  const baseUrl = getBaseUrl();
  const headers = {
    "Square-Version": "2025-05-21",
    Authorization: "Bearer " + token,
    "Content-Type": "application/json",
  };

  const mappedLines = lineItems.map((li) => {
    const qty = Math.max(1, Math.floor(Number(li.quantity) || 1));
    const price = Number(li.price);
    const unitCents = Number.isFinite(price) ? Math.round(price * 100) : 0;
    return {
      name: safeTrim(li.name) || "Item",
      quantity: String(qty),
      base_price_money: {
        amount: unitCents,
        currency: "USD",
      },
    };
  });

  if (mappedLines.some((l) => l.base_price_money.amount <= 0)) {
    return { success: false, error: "Each line item needs a positive price" };
  }

  const orderBody = {
    order: {
      location_id: locationId,
      customer_id: customerId,
      line_items: mappedLines,
    },
    idempotency_key: "cheeky-draft-ord-" + Date.now(),
  };

  try {
    const orderRes = await fetch(baseUrl + "/orders", {
      method: "POST",
      headers,
      body: JSON.stringify(orderBody),
    });
    const orderData = await orderRes.json();

    if (!orderRes.ok) {
      const msg = summarizeSquareError(orderData);
      logger.error("[squareDraftInvoice] order failed: " + msg);
      return { success: false, error: msg };
    }

    const orderId = orderData.order && orderData.order.id;
    if (!orderId) {
      return { success: false, error: "Square did not return an order id" };
    }

    const invoiceBody = {
      invoice: {
        location_id: locationId,
        order_id: orderId,
        title: "Draft invoice",
        primary_recipient: {
          customer_id: customerId,
        },
        payment_requests: [
          {
            request_type: "BALANCE",
            due_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
          },
        ],
        delivery_method: "SHARE_MANUALLY",
        accepted_payment_methods: {
          card: true,
          bank_account: false,
          square_gift_card: false,
          cash_app_pay: true,
        },
      },
      idempotency_key: "cheeky-draft-inv-" + Date.now(),
    };

    const invRes = await fetch(baseUrl + "/invoices", {
      method: "POST",
      headers,
      body: JSON.stringify(invoiceBody),
    });
    const invData = await invRes.json();

    if (!invRes.ok) {
      const msg = summarizeSquareError(invData);
      logger.error("[squareDraftInvoice] invoice failed: " + msg);
      return { success: false, error: msg };
    }

    const invoice = invData.invoice || {};
    const invoiceId = invoice.id || "";
    const st = String(invoice.status || "DRAFT").toUpperCase();

    return {
      success: true,
      invoiceId,
      status: st === "DRAFT" || st === "UNPAID" ? "DRAFT" : st,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[squareDraftInvoice] " + msg);
    return { success: false, error: msg };
  }
}

function safeTrim(s) {
  return String(s == null ? "" : s).trim();
}

function summarizeSquareError(data) {
  if (!data || typeof data !== "object") return "Square request failed";
  const errs = data.errors;
  if (Array.isArray(errs) && errs.length > 0) {
    return errs.map((e) => e.detail || e.code || e.category).filter(Boolean).join("; ") || "Square API error";
  }
  return data.message || "Square request failed";
}

module.exports = { createDraftInvoice };
