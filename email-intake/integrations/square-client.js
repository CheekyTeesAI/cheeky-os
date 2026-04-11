/**
 * Square API client for Cheeky Tees.
 * Connects to Square API v2 for customer management, estimates, and invoicing.
 * All functions are defensive — they never throw. On failure they return
 * { success: false, error: "..." } so the intake pipeline is never blocked.
 *
 * Requires: SQUARE_ACCESS_TOKEN, SQUARE_LOCATION_ID in .env
 * Optional: SQUARE_ENVIRONMENT (sandbox|production, default: sandbox)
 *
 * @module integrations/square-client
 */

console.log("🔥 USING THIS FILE: square-client.js");const fs = require("fs");
const path = require("path");
const {
  mapToSquareLineItem,
  mapToSquareCustomer,
  calculateDueDate,
  buildInvoiceMemo,
} = require("./square-mapper");

// ── Config ──────────────────────────────────────────────────────────────────
const SQUARE_ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN || "";
const SQUARE_LOCATION_ID = process.env.SQUARE_LOCATION_ID || "";
const SQUARE_ENV = "production";
console.log("🚨 SQUARE DEBUG →", {
  ENV: process.env.SQUARE_ENVIRONMENT,
  TOKEN_START: process.env.SQUARE_ACCESS_TOKEN?.slice(0, 10),
  TOKEN_END: process.env.SQUARE_ACCESS_TOKEN?.slice(-6),
  LOCATION: process.env.SQUARE_LOCATION_ID
});

/** Base URL switches between sandbox and production. */
const BASE_URL =
  SQUARE_ENV === "production"
    ? "https://connect.squareup.com/v2"
    : "https://connect.squareupsandbox.com/v2";

// ── Logging ─────────────────────────────────────────────────────────────────
const LOG_DIR = path.join(__dirname, "..", "logs");
const LOG_FILE = path.join(LOG_DIR, "square.log");
fs.mkdirSync(LOG_DIR, { recursive: true });

/**
 * Build a formatted timestamp for log entries.
 * @returns {string} Timestamp in YYYY-MM-DD HH:mm:ss format.
 */
function timestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  );
}

/**
 * Log a message to both console and logs/square.log.
 * @param {string} level - Log level (INFO, WARN, ERROR).
 * @param {string} msg   - Message text.
 */
function log(level, msg) {
  const line = `[${timestamp()}] ${level} | ${msg}`;
  if (level === "ERROR") {
    console.error(`❌ [SQUARE] ${msg}`);
  } else if (level === "WARN") {
    console.log(`⚠️ [SQUARE] ${msg}`);
  } else {
    console.log(`🟪 [SQUARE] ${msg}`);
  }
  try {
    fs.appendFileSync(LOG_FILE, line + "\n");
  } catch {
    // Silent fail — logging must never crash the pipeline
  }
}

/**
 * Check whether Square integration is configured.
 * @returns {boolean} True if access token and location ID are set.
 */
function isConfigured() {
  return !!(SQUARE_ACCESS_TOKEN && SQUARE_LOCATION_ID);
}

/**
 * Make an authenticated request to the Square API.
 * @param {string} method   - HTTP method (GET, POST, PUT).
 * @param {string} endpoint - API path after /v2 (e.g. "/customers").
 * @param {Object} [body]   - Request body (will be JSON-stringified).
 * @returns {Promise<{ok: boolean, status: number, data: Object}>}
 */
async function squareRequest(method, endpoint, body) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {
    "Square-Version": "2024-12-18",
    Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const options = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);
  let data = {};
  try {
    data = await res.json();
  } catch {
    // Some responses have no JSON body
  }
  return { ok: res.ok, status: res.status, data };
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Search for an existing Square customer by email, or create a new one.
 * Returns the customer ID for use in invoices/estimates.
 *
 * @param {string} email - Customer email address.
 * @param {string} name  - Customer full name.
 * @param {string} phone - Customer phone number.
 * @returns {Promise<{success: boolean, customerId?: string, isNew?: boolean, error?: string}>}
 */
async function getOrCreateCustomer(email, name, phone) {
  if (!isConfigured()) {
    log("WARN", "Square not configured — skipping getOrCreateCustomer");
    return { success: false, error: "Square not configured (missing SQUARE_ACCESS_TOKEN or SQUARE_LOCATION_ID)." };
  }

  try {
    // Step 1: Search by email if provided
    if (email) {
      log("INFO", `Searching Square for customer: ${email}`);
      const searchRes = await squareRequest("POST", "/customers/search", {
        query: {
          filter: {
            email_address: { exact: email },
          },
        },
      });

      if (searchRes.ok && searchRes.data.customers && searchRes.data.customers.length > 0) {
        const existing = searchRes.data.customers[0];
        log("INFO", `Found existing Square customer: ${existing.id} (${existing.given_name || ""} ${existing.family_name || ""})`);
        return { success: true, customerId: existing.id, isNew: false };
      }
    }

    // Step 2: Create new customer
    log("INFO", `Creating new Square customer: ${name || "(no name)"} <${email || "(no email)"}>`);
    const customerPayload = mapToSquareCustomer(name, email, phone);
    const createRes = await squareRequest("POST", "/customers", customerPayload);

    if (createRes.ok && createRes.data.customer) {
      const newCust = createRes.data.customer;
      log("INFO", `Created Square customer: ${newCust.id}`);
      return { success: true, customerId: newCust.id, isNew: true };
    }

    const errMsg = JSON.stringify(createRes.data.errors || createRes.data);
    log("ERROR", `Failed to create Square customer: ${errMsg}`);
    return { success: false, error: `Square create customer failed: ${errMsg}` };
  } catch (err) {
    log("ERROR", `getOrCreateCustomer error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Create a draft estimate (invoice in DRAFT status) in Square.
 * The estimate can be reviewed and edited by Pat before sending.
 *
 * @param {Object} orderData - Order data (customerName, email, product, quantity, printType, deadline, etc.).
 * @returns {Promise<{success: boolean, estimateId?: string, url?: string, error?: string}>}
 */
async function createEstimate(orderData) {
  if (!isConfigured()) {
    log("WARN", "Square not configured — skipping createEstimate");
    return { success: false, error: "Square not configured (missing SQUARE_ACCESS_TOKEN or SQUARE_LOCATION_ID)." };
  }

  try {
    log("INFO", `Creating estimate for: ${orderData.customerName || "(unknown)"}`);

    // Step 1: Get or create customer
    const custResult = await getOrCreateCustomer(
      orderData.email,
      orderData.customerName,
      orderData.phone || ""
    );

    // Step 2: Create an order (required before invoice)
    const lineItem = mapToSquareLineItem(orderData);
    const orderPayload = {
      order: {
        location_id: SQUARE_LOCATION_ID,
        line_items: [
          {
            name: lineItem.name,
            quantity: lineItem.quantity,
            note: lineItem.description,
            base_price_money: lineItem.base_price_money,
          },
        ],
        state: "OPEN",
      },
      idempotency_key: `cheeky-est-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };

    if (custResult.success && custResult.customerId) {
      orderPayload.order.customer_id = custResult.customerId;
    }

    const orderRes = await squareRequest("POST", "/orders", orderPayload);
    if (!orderRes.ok || !orderRes.data.order) {
      const errMsg = JSON.stringify(orderRes.data.errors || orderRes.data);
      log("ERROR", `Failed to create Square order for estimate: ${errMsg}`);
      return { success: false, error: `Square order creation failed: ${errMsg}` };
    }

    const squareOrderId = orderRes.data.order.id;
    log("INFO", `Square order created: ${squareOrderId}`);

    // Step 3: Create DRAFT invoice linked to the order
    const dueDate = calculateDueDate(orderData.deadline);
    const invoicePayload = {
      invoice: {
        location_id: SQUARE_LOCATION_ID,
        order_id: squareOrderId,
        payment_requests: [
          {
            request_type: "BALANCE",
            due_date: dueDate,
          },
        ],
        delivery_method: "EMAIL",
        title: `Cheeky Tees Estimate — ${orderData.customerName || "Customer"}`,
        description: buildInvoiceMemo(orderData),
      },
      idempotency_key: `cheeky-inv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };

    if (custResult.success && custResult.customerId) {
      invoicePayload.invoice.primary_recipient = {
        customer_id: custResult.customerId,
      };
    }

    const invRes = await squareRequest("POST", "/invoices", invoicePayload);
    if (!invRes.ok || !invRes.data.invoice) {
      const errMsg = JSON.stringify(invRes.data.errors || invRes.data);
      log("ERROR", `Failed to create Square estimate: ${errMsg}`);
      return { success: false, error: `Square estimate creation failed: ${errMsg}` };
    }

    const invoice = invRes.data.invoice;
    log("INFO", `Estimate created (DRAFT): ${invoice.id} | Due: ${dueDate}`);
    return {
      success: true,
      estimateId: invoice.id,
      url: invoice.public_url || null,
    };
  } catch (err) {
    log("ERROR", `createEstimate error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Create and publish (send) a Square invoice for an order.
 * The invoice is emailed to the customer for payment.
 *
 * @param {Object} orderData - Order data (customerName, email, product, quantity, printType, deadline, etc.).
 * @returns {Promise<{success: boolean, invoiceId?: string, url?: string, error?: string}>}
 */
async function createInvoice(orderData) {
  if (!isConfigured()) {
    log("WARN", "Square not configured — skipping createInvoice");
    return { success: false, error: "Square not configured (missing SQUARE_ACCESS_TOKEN or SQUARE_LOCATION_ID)." };
  }

  try {
    log("INFO", `Creating invoice for: ${orderData.customerName || "(unknown)"}`);

    // Step 1: Create the draft estimate first
    const draftResult = await createEstimate(orderData);
    if (!draftResult.success) {
      return draftResult; // Propagate the error
    }

    // Step 2: Publish the invoice (sends it to the customer)
    log("INFO", `Publishing invoice: ${draftResult.estimateId}`);

    // Need to get the invoice version first
    const getRes = await squareRequest("GET", `/invoices/${draftResult.estimateId}`);
    if (!getRes.ok || !getRes.data.invoice) {
      const errMsg = JSON.stringify(getRes.data.errors || getRes.data);
      log("ERROR", `Failed to fetch invoice for publishing: ${errMsg}`);
      return { success: false, error: `Invoice fetch failed: ${errMsg}` };
    }

    const version = getRes.data.invoice.version;
    const pubRes = await squareRequest("POST", `/invoices/${draftResult.estimateId}/publish`, {
      version,
      idempotency_key: `cheeky-pub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    });

    if (!pubRes.ok || !pubRes.data.invoice) {
      const errMsg = JSON.stringify(pubRes.data.errors || pubRes.data);
      log("ERROR", `Failed to publish invoice: ${errMsg}`);
      // Return the draft as partial success — it was created, just not sent
      return {
        success: true,
        invoiceId: draftResult.estimateId,
        url: draftResult.url,
        published: false,
        error: `Invoice created as DRAFT but publish failed: ${errMsg}`,
      };
    }

    const published = pubRes.data.invoice;
    log("INFO", `Invoice published: ${published.id} | Status: ${published.status}`);
    return {
      success: true,
      invoiceId: published.id,
      url: published.public_url || draftResult.url || null,
      published: true,
    };
  } catch (err) {
    log("ERROR", `createInvoice error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

module.exports = {
  getOrCreateCustomer,
  createEstimate,
  createInvoice,
  isConfigured,
  // Exported for testing
  log,
  BASE_URL,
};
