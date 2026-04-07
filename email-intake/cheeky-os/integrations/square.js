/**
 * Cheeky OS — Square invoice integration.
 * Creates invoices via Square Orders + Invoices API, or returns mock in dev mode.
 *
 * Env vars: SQUARE_ACCESS_TOKEN, optional SQUARE_LOCATION_ID, optional SQUARE_ENVIRONMENT
 *
 * @module cheeky-os/integrations/square
 */

const { logger } = require("../utils/logger");

const squareState = {
  initialized: false,
  initPromise: null,
  tokenPrefix: "",
  explicitEnvironment: null,
  tokenDetectedEnvironment: "production",
  environment: "production",
  authVerified: false,
  selectedLocation: null,
  lastError: null,
  warnings: new Set(),
};

function getToken() {
  return (process.env.SQUARE_ACCESS_TOKEN || "").trim();
}

function warnOnce(key, message) {
  if (squareState.warnings.has(key)) return;
  squareState.warnings.add(key);
  logger.warn(message);
}

function normalizeExplicitEnvironment(value) {
  const env = String(value || "").trim().toLowerCase();
  if (env === "sandbox" || env === "production") return env;
  return null;
}

function detectEnvironmentFromToken(token) {
  if (!token) return "production";
  if (token.startsWith("EAAAl") && token.includes("-EAAA")) return "sandbox";
  if (token.startsWith("EAAAl") && !token.includes("-EAAA")) return "production";
  return "production";
}

function getSquareRuntimeConfig() {
  const token = getToken();
  const tokenPrefix = token ? token.slice(0, 12) : "";
  const explicitEnvironment = normalizeExplicitEnvironment(process.env.SQUARE_ENVIRONMENT);
  const tokenDetectedEnvironment = detectEnvironmentFromToken(token);
  const environment = explicitEnvironment || tokenDetectedEnvironment;
  const configuredLocationId = (process.env.SQUARE_LOCATION_ID || "").trim();
  return {
    token,
    tokenPrefix,
    explicitEnvironment,
    tokenDetectedEnvironment,
    environment,
    configuredLocationId,
  };
}

function getBaseUrlForEnvironment(environment) {
  return environment === "sandbox"
    ? "https://connect.squareupsandbox.com/v2"
    : "https://connect.squareup.com/v2";
}

/**
 * Resolve Square API base URL from token-detected environment.
 * @returns {string}
 */
function getBaseUrl() {
  return getBaseUrlForEnvironment(squareState.environment);
}

async function initializeSquareIntegration() {
  if (squareState.initPromise) return squareState.initPromise;

  squareState.initPromise = (async () => {
    const config = getSquareRuntimeConfig();
    const { token, tokenPrefix, explicitEnvironment, tokenDetectedEnvironment, environment, configuredLocationId } = config;
    squareState.tokenPrefix = tokenPrefix;
    squareState.explicitEnvironment = explicitEnvironment;
    squareState.tokenDetectedEnvironment = tokenDetectedEnvironment;
    squareState.environment = environment;
    squareState.authVerified = false;
    squareState.selectedLocation = null;
    squareState.lastError = null;

    console.log(`[SQUARE INIT] token_prefix=${token ? token.slice(0, 10) : "(empty)"}`);
    if (explicitEnvironment) {
      logger.info(`[SQUARE] Using environment from .env: ${explicitEnvironment}`);
      if (explicitEnvironment !== tokenDetectedEnvironment) {
        warnOnce(
          "env-mismatch",
          `[SQUARE] Environment mismatch detected. Token suggests "${tokenDetectedEnvironment}" but .env forces "${explicitEnvironment}". Respecting .env setting.`
        );
      }
    } else {
      logger.info(`[SQUARE] Auto-detected environment: ${squareState.environment}`);
    }

    if (!token) {
      squareState.lastError = "Square not configured";
      logger.info("[SQUARE] Integration disabled (no token configured).");
      squareState.initialized = true;
      logger.info("[SQUARE] Startup status: SKIPPED - not configured");
      return squareState;
    }

    const baseUrl = getBaseUrlForEnvironment(squareState.environment);
    const headers = {
      "Square-Version": "2025-05-21",
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    };

    try {
      const response = await fetch(baseUrl + "/locations", { method: "GET", headers });
      const data = await response.json();

      if (response.status === 401) {
        squareState.lastError = "Token invalid";
        warnOnce("token-invalid", "[SQUARE] ❌ Token invalid - Square integration disabled. Check SQUARE_ACCESS_TOKEN in .env");
        logger.info("[SQUARE] Startup status: SKIPPED - invalid token");
        squareState.initialized = true;
        return squareState;
      }

      if (!response.ok) {
        squareState.lastError = JSON.stringify(data.errors || data);
        logger.warn(`[SQUARE] Location self-test failed: ${squareState.lastError}`);
        squareState.initialized = true;
        return squareState;
      }

      const locations = Array.isArray(data.locations) ? data.locations : [];
      const active = locations.find((loc) => String(loc.status || "").toUpperCase() === "ACTIVE");
      squareState.authVerified = true;
      logger.info("[SQUARE] ✅ Auth verified");

      if (active) {
        squareState.selectedLocation = {
          id: active.id,
          name: active.name || "(unnamed)",
        };
      } else if (configuredLocationId) {
        const fallback = locations.find((loc) => loc.id === configuredLocationId);
        if (fallback) {
          squareState.selectedLocation = {
            id: fallback.id,
            name: fallback.name || "(unnamed)",
          };
        }
      }

      if (!squareState.selectedLocation) {
        squareState.lastError = "No ACTIVE location found";
        warnOnce("no-location", "[SQUARE] No active/usable location found - Square integration disabled.");
        logger.info("[SQUARE] Startup status: SKIPPED - no active location");
        squareState.initialized = true;
        return squareState;
      }

      logger.info(`[SQUARE] Auto-selected location: ${squareState.selectedLocation.name} (${squareState.selectedLocation.id})`);
      logger.info("[SQUARE] Startup status: READY");
      squareState.initialized = true;
      return squareState;
    } catch (err) {
      squareState.lastError = err.message;
      warnOnce("self-test-failed", `[SQUARE] Location self-test failed: ${err.message}`);
      logger.info("[SQUARE] Startup status: SKIPPED - auth test failed");
      squareState.initialized = true;
      return squareState;
    }
  })();

  return squareState.initPromise;
}

async function testSquareAuth() {
  await initializeSquareIntegration();
  const { tokenPrefix } = getSquareRuntimeConfig();
  return {
    ok: !!squareState.authVerified,
    token_prefix: tokenPrefix,
    auto_detected_environment: squareState.environment,
    auto_selected_location: squareState.selectedLocation,
    auth_verified: !!squareState.authVerified,
    square_app_hint: "If auth fails, make sure your token comes from the same Square app as your location",
    error: squareState.lastError,
  };
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

  await initializeSquareIntegration();
  const token = getToken();
  const locationId = squareState.selectedLocation && squareState.selectedLocation.id;

  // ── Mock mode — no credentials ────────────────────────────────────────────
  if (!token || !locationId) {
    logger.info(`[SQUARE] Disabled/mock mode — missing verified auth/location. Invoice for "${customerName}": $${total}`);
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

initializeSquareIntegration().catch(() => null);

function getSquareIntegrationStatus() {
  const status = squareState.authVerified
    ? "READY"
    : (squareState.lastError === "Square not configured" ? "SKIPPED - not configured" : "SKIPPED - invalid token");
  return {
    status,
    environment: squareState.environment,
    tokenPrefix: squareState.tokenPrefix || "",
    location: squareState.selectedLocation,
    error: squareState.lastError,
  };
}

module.exports = {
  createSquareInvoice,
  testSquareAuth,
  initializeSquareIntegration,
  getSquareIntegrationStatus,
  getSquareRuntimeConfig,
  getBaseUrl,
};
