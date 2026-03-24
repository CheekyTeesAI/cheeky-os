/**
 * Cheeky OS — Square invoice integration.
 * Creates invoices via Square Orders + Invoices API, or returns mock in dev mode.
 *
 * Env vars: SQUARE_ACCESS_TOKEN, SQUARE_LOCATION_ID, SQUARE_ENVIRONMENT
 *
 * @module cheeky-os/integrations/square
 */

const { logger } = require("../utils/logger");

function getSquareEnvironment() {
  return (process.env.SQUARE_ENVIRONMENT || "production").toLowerCase();
}

function resolveEnvironmentFromToken() {
  const env = getSquareEnvironment();
  const token = (process.env.SQUARE_ACCESS_TOKEN || "").trim();
  if (!token) return env;
  const looksSandbox = token.startsWith("EAAAl");
  if (env === "sandbox" && !looksSandbox) return "production";
  if (env === "production" && looksSandbox) return "sandbox";
  return env;
}

/**
 * Resolve Square API base URL from environment setting.
 * @returns {string}
 */
function getBaseUrl() {
  const env = resolveEnvironmentFromToken();
  return env === "sandbox"
    ? "https://connect.squareupsandbox.com/v2"
    : "https://connect.squareup.com/v2";
}

function validateSquareAuthEnvironment() {
  const token = (process.env.SQUARE_ACCESS_TOKEN || "").trim();
  const env = getSquareEnvironment();
  const effectiveEnv = resolveEnvironmentFromToken();
  if (!token) return;
  const looksSandbox = token.startsWith("EAAAl");
  if (env === "sandbox" && !looksSandbox) {
    logger.warn(
      '[SQUARE] Auth/environment mismatch: SQUARE_ENVIRONMENT="sandbox" but token does not look like a sandbox token (expected prefix "EAAAl"). Using production API host.'
    );
  }
  if (env === "production" && looksSandbox) {
    logger.warn(
      '[SQUARE] Auth/environment mismatch: SQUARE_ENVIRONMENT="production" but token looks like a sandbox token (prefix "EAAAl"). Using sandbox API host.'
    );
  }
  if (env !== effectiveEnv) {
    logger.warn(`[SQUARE] Effective environment switched to "${effectiveEnv}" based on token format.`);
  }
}

async function testSquareAuth() {
  const token = (process.env.SQUARE_ACCESS_TOKEN || "").trim();
  const locationId = (process.env.SQUARE_LOCATION_ID || "").trim();
  const env = resolveEnvironmentFromToken();

  if (!token || !locationId) {
    return {
      ok: false,
      data: null,
      error: "Square not configured - set SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID in .env",
    };
  }

  const baseUrl = getBaseUrl();
  const headers = {
    "Square-Version": "2025-05-21",
    Authorization: "Bearer " + token,
    "Content-Type": "application/json",
  };

  try {
    const response = await fetch(baseUrl + "/locations", { method: "GET", headers });
    const data = await response.json();
    return {
      ok: response.ok,
      data: {
        environment: env,
        status: response.status,
        raw: data,
      },
      error: response.ok ? null : JSON.stringify(data.errors || data),
    };
  } catch (err) {
    return { ok: false, data: null, error: err.message };
  }
}

/**
 * Create a Square invoice from a quote/order payload.
 * Returns mock data when credentials are missing — never throws.
 *
 * @param {{ customerName: string, customerEmail: string, title: string, quantity: number, unitPrice: number, total: number, deposit: number }} payload
 * @returns {Promise<{ mode: string, invoiceId: string|null, orderId: string|null, status: string, total: number, deposit: number, raw: any }>}
 */
async function createSquareInvoice(payload) {
  const { customerName, customerEmail, title, quantity, unitPrice, total, deposit } = payload;

  const token = process.env.SQUARE_ACCESS_TOKEN;
  const locationId = process.env.SQUARE_LOCATION_ID;

  // ── Mock mode — no credentials ────────────────────────────────────────────
  if (!token || !locationId) {
    logger.info(`[SQUARE] Mock mode — no credentials. Invoice for "${customerName}": $${total}`);
    return {
      mode: "mock",
      invoiceId: "mock-" + Date.now(),
      orderId: null,
      status: "draft",
      total,
      deposit,
      raw: null,
    };
  }

  // ── Live mode — Square API ────────────────────────────────────────────────
  const baseUrl = getBaseUrl();
  const headers = {
    "Square-Version": "2025-05-21",
    "Authorization": "Bearer " + token,
    "Content-Type": "application/json",
  };

  try {
    // 1. Create order
    const orderBody = {
      order: {
        location_id: locationId,
        line_items: [
          {
            name: title || "Custom Order",
            quantity: String(quantity || 1),
            base_price_money: {
              amount: Math.round((unitPrice || 0) * 100), // cents
              currency: "USD",
            },
          },
        ],
      },
      idempotency_key: "cheek-ord-" + Date.now(),
    };

    const orderRes = await fetch(baseUrl + "/orders", {
      method: "POST",
      headers,
      body: JSON.stringify(orderBody),
    });
    const orderData = await orderRes.json();

    if (!orderRes.ok) {
      logger.error(`[SQUARE] Order creation failed: ${JSON.stringify(orderData.errors || orderData)}`);
      return { mode: "error", invoiceId: null, orderId: null, status: "failed", total, deposit, raw: orderData };
    }

    const orderId = orderData.order && orderData.order.id;
    logger.info(`[SQUARE] Order created: ${orderId}`);

    // 2. Create invoice
    const depositCents = Math.round((deposit || 0) * 100);
    const invoiceBody = {
      invoice: {
        location_id: locationId,
        order_id: orderId,
        title: `Invoice: ${title || "Custom Order"} — ${customerName}`,
        primary_recipient: {
          given_name: customerName || "Customer",
          email_address: customerEmail || undefined,
        },
        payment_requests: [
          {
            request_type: "DEPOSIT",
            due_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
            fixed_amount_requested_money: {
              amount: depositCents,
              currency: "USD",
            },
          },
          {
            request_type: "BALANCE",
            due_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
          },
        ],
        delivery_method: customerEmail ? "EMAIL" : "SHARE_MANUALLY",
        accepted_payment_methods: {
          card: true,
          bank_account: false,
          square_gift_card: false,
          cash_app_pay: true,
        },
      },
      idempotency_key: "cheek-inv-" + Date.now(),
    };

    const invRes = await fetch(baseUrl + "/invoices", {
      method: "POST",
      headers,
      body: JSON.stringify(invoiceBody),
    });
    const invData = await invRes.json();

    if (!invRes.ok) {
      logger.error(`[SQUARE] Invoice creation failed: ${JSON.stringify(invData.errors || invData)}`);
      // Order was created — return as draft with the order reference
      return {
        mode: "square_draft",
        invoiceId: null,
        orderId,
        status: "order_created_invoice_failed",
        total,
        deposit,
        raw: { order: orderData, invoiceError: invData },
      };
    }

    const invoiceId = invData.invoice && invData.invoice.id;
    const invoiceStatus = (invData.invoice && invData.invoice.status) || "DRAFT";
    logger.info(`[SQUARE] Invoice created: ${invoiceId} (${invoiceStatus})`);

    return {
      mode: "square_live",
      invoiceId,
      orderId,
      status: invoiceStatus.toLowerCase(),
      total,
      deposit,
      raw: invData,
    };
  } catch (err) {
    logger.error(`[SQUARE] Unhandled error: ${err.message}`);
    return { mode: "error", invoiceId: null, orderId: null, status: "failed", total, deposit, raw: null };
  }
}

validateSquareAuthEnvironment();

module.exports = { createSquareInvoice, testSquareAuth, validateSquareAuthEnvironment };
