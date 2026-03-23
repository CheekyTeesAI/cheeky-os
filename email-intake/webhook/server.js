// PHASE 2+8 — WEBHOOK ENDPOINT: Express server for Cheeky Tees
/**
 * Express server for the Cheeky Tees intake pipeline.
 * Accepts pre-structured order JSON and Power Automate callbacks.
 *
 * Endpoints:
 *   POST /intake              — Submit an order (returns { success, recordId, customer })
 *   POST /order-complete       — Mark order complete, trigger customer notification
 *   POST /notify-customer      — Send a notification to a customer
 *   POST /production-update    — Update production stage for an order
 *   GET  /health               — Health check (returns { status: "ok", uptime })
 *
 * Run standalone: node webhook/server.js
 * Or via start.js for unified startup.
 *
 * All activity is logged to logs/webhook.log and console.
 *
 * @module webhook/server
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const express = require("express");
const fs = require("fs");
const path = require("path");

// Lazy-load intake to ensure dotenv is fully loaded first
let _intake = null;
/**
 * Lazy-load the intake module on first request.
 * @returns {Object} The intake module exports.
 */
function getIntake() {
  if (!_intake) {
    _intake = require("../intake");
  }
  return _intake;
}

/** Server port — defaults to 3001. */
const PORT = process.env.PORT || 3001;

/** Optional webhook secret for basic auth. */
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";

/** Log directory and file setup. */
const LOG_DIR = path.join(__dirname, "..", "logs");
const LOG_FILE = path.join(LOG_DIR, "webhook.log");
fs.mkdirSync(LOG_DIR, { recursive: true });

/** Server start time for uptime calculation. */
const startedAt = new Date();

/**
 * Build a formatted timestamp string for log entries.
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
 * Log a message to both console and the webhook log file.
 * @param {string} level - Log level (INFO, WARN, ERROR).
 * @param {string} msg   - Message text.
 */
function log(level, msg) {
  const line = `[${timestamp()}] ${level} | ${msg}`;
  if (level === "ERROR") {
    console.error(`❌ [WEBHOOK] ${msg}`);
  } else if (level === "WARN") {
    console.log(`⚠️ [WEBHOOK] ${msg}`);
  } else {
    console.log(`🌐 [WEBHOOK] ${msg}`);
  }
  try {
    fs.appendFileSync(LOG_FILE, line + "\n");
  } catch {
    // Silent fail — logging must never crash the server
  }
}

// ── Express app setup ───────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: "1mb" }));

/**
 * Middleware: validate webhook secret if configured.
 * Checks the x-webhook-secret header against WEBHOOK_SECRET env var.
 * Skips validation if WEBHOOK_SECRET is not set (dev mode).
 */
function authMiddleware(req, res, next) {
  if (!WEBHOOK_SECRET) {
    return next(); // No secret configured — allow all requests (dev mode)
  }
  const provided = req.headers["x-webhook-secret"] || "";
  if (provided !== WEBHOOK_SECRET) {
    log("WARN", `Unauthorized request from ${req.ip} — invalid webhook secret`);
    return res.status(401).json({ success: false, error: "Unauthorized: invalid webhook secret" });
  }
  next();
}

// ── GET / — root route ──────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.send("Cheeky API running");
});

// ── GET /health — health check endpoint ─────────────────────────────────────
app.get("/health", (req, res) => {
  const uptimeMs = Date.now() - startedAt.getTime();
  const uptimeSec = Math.floor(uptimeMs / 1000);
  res.json({
    status: "ok",
    service: "Cheeky Tees Webhook Intake",
    uptime: `${uptimeSec}s`,
    startedAt: startedAt.toISOString(),
  });
});

// ── POST /intake — order intake endpoint ────────────────────────────────────
app.post("/intake", authMiddleware, async (req, res) => {
  const requestId = `wh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  log("INFO", `[${requestId}] POST /intake from ${req.ip}`);

  try {
    const orderJson = req.body;

    // Basic validation — must have at least a customer name or product
    if (!orderJson || typeof orderJson !== "object") {
      log("WARN", `[${requestId}] Empty or invalid request body`);
      return res.status(400).json({
        success: false,
        requestId,
        error: "Request body must be a JSON object with order fields.",
      });
    }

    if (!orderJson.customerName && !orderJson.product && !orderJson.quantity) {
      log("WARN", `[${requestId}] No recognizable order fields in body`);
      return res.status(400).json({
        success: false,
        requestId,
        error: "Order must include at least one of: customerName, product, quantity.",
      });
    }

    log("INFO", `[${requestId}] Processing order for: ${orderJson.customerName || "(unknown)"}`);

    // Run through the intake pipeline (no OpenAI — pre-structured JSON)
    const intake = getIntake();
    const result = await intake.handleWebhook(orderJson);

    log("INFO", `[${requestId}] ✅ Order created | Record ID: ${result.recordId || "(unknown)"}`);

    return res.status(201).json({
      success: true,
      requestId,
      recordId: result.recordId || null,
      customer: result.mapped?.customerName || null,
      message: "Order created successfully in Dataverse.",
    });
  } catch (err) {
    log("ERROR", `[${requestId}] Failed: ${err.message}`);
    return res.status(500).json({
      success: false,
      requestId,
      error: err.message,
    });
  }
});

// ── POST /order-complete — mark order complete + trigger notification ────────
/** Valid fields for the /order-complete payload. */
const ORDER_COMPLETE_REQUIRED = ["orderId", "customerName", "email", "product", "quantity"];

/**
 * POST /order-complete
 * Called by Power Automate (Flow 1) or manually when an order is finished.
 * Accepts { orderId, customerName, email, product, quantity }.
 * Triggers customer notification logic (placeholder — logs the event).
 * @param {Object} req.body - Order completion payload.
 */
app.post("/order-complete", authMiddleware, async (req, res) => {
  const requestId = `oc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  log("INFO", `[${requestId}] POST /order-complete from ${req.ip}`);

  try {
    const body = req.body;

    if (!body || typeof body !== "object") {
      log("WARN", `[${requestId}] Empty or invalid request body`);
      return res.status(400).json({
        success: false,
        requestId,
        error: "Request body must be a JSON object.",
      });
    }

    // Validate required fields
    const missing = ORDER_COMPLETE_REQUIRED.filter((f) => !body[f]);
    if (missing.length > 0) {
      log("WARN", `[${requestId}] Missing required fields: ${missing.join(", ")}`);
      return res.status(400).json({
        success: false,
        requestId,
        error: `Missing required fields: ${missing.join(", ")}`,
        requiredFields: ORDER_COMPLETE_REQUIRED,
      });
    }

    log("INFO", `[${requestId}] Order complete: ${body.orderId} | ${body.customerName} | ${body.product} x${body.quantity}`);
    log("INFO", `[${requestId}] Customer notification queued for ${body.email}`);

    return res.status(200).json({
      success: true,
      requestId,
      message: `Order ${body.orderId} marked complete. Customer notification queued for ${body.email}.`,
    });
  } catch (err) {
    log("ERROR", `[${requestId}] Failed: ${err.message}`);
    return res.status(500).json({
      success: false,
      requestId,
      error: err.message,
    });
  }
});

// ── POST /notify-customer — send a customer notification ────────────────────
/** Valid fields for the /notify-customer payload. */
const NOTIFY_REQUIRED = ["email", "customerName", "orderId", "status"];

/**
 * POST /notify-customer
 * Logs a customer notification attempt. In production, this is called by
 * Power Automate or internal tools to confirm a notification was sent.
 * Accepts { email, customerName, orderId, status, message }.
 * @param {Object} req.body - Notification payload.
 */
app.post("/notify-customer", authMiddleware, async (req, res) => {
  const requestId = `nc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  log("INFO", `[${requestId}] POST /notify-customer from ${req.ip}`);

  try {
    const body = req.body;

    if (!body || typeof body !== "object") {
      log("WARN", `[${requestId}] Empty or invalid request body`);
      return res.status(400).json({
        success: false,
        requestId,
        error: "Request body must be a JSON object.",
      });
    }

    // Validate required fields
    const missing = NOTIFY_REQUIRED.filter((f) => !body[f]);
    if (missing.length > 0) {
      log("WARN", `[${requestId}] Missing required fields: ${missing.join(", ")}`);
      return res.status(400).json({
        success: false,
        requestId,
        error: `Missing required fields: ${missing.join(", ")}`,
        requiredFields: NOTIFY_REQUIRED,
      });
    }

    const notifMsg = body.message || `Your order ${body.orderId} status: ${body.status}`;
    log("INFO", `[${requestId}] Notify: ${body.customerName} <${body.email}> | Order: ${body.orderId} | Status: ${body.status}`);
    log("INFO", `[${requestId}] Message: ${notifMsg}`);

    return res.status(200).json({
      success: true,
      requestId,
      notified: true,
      email: body.email,
      orderId: body.orderId,
      status: body.status,
      message: notifMsg,
    });
  } catch (err) {
    log("ERROR", `[${requestId}] Failed: ${err.message}`);
    return res.status(500).json({
      success: false,
      requestId,
      error: err.message,
    });
  }
});

// ── POST /production-update — update production stage ───────────────────────
/** Valid production stages (matches ct_production.ct_stage). */
const VALID_STAGES = ["received", "art", "printing", "finished", "shipped"];

/** Valid fields for the /production-update payload. */
const PROD_UPDATE_REQUIRED = ["orderId", "stage", "updatedBy"];

/**
 * POST /production-update
 * Accepts a production stage update for an order.
 * Validates the stage against allowed values.
 * Accepts { orderId, stage, updatedBy, notes }.
 * @param {Object} req.body - Production update payload.
 */
app.post("/production-update", authMiddleware, async (req, res) => {
  const requestId = `pu-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  log("INFO", `[${requestId}] POST /production-update from ${req.ip}`);

  try {
    const body = req.body;

    if (!body || typeof body !== "object") {
      log("WARN", `[${requestId}] Empty or invalid request body`);
      return res.status(400).json({
        success: false,
        requestId,
        error: "Request body must be a JSON object.",
      });
    }

    // Validate required fields
    const missing = PROD_UPDATE_REQUIRED.filter((f) => !body[f]);
    if (missing.length > 0) {
      log("WARN", `[${requestId}] Missing required fields: ${missing.join(", ")}`);
      return res.status(400).json({
        success: false,
        requestId,
        error: `Missing required fields: ${missing.join(", ")}`,
        requiredFields: PROD_UPDATE_REQUIRED,
      });
    }

    // Validate stage value
    const stage = body.stage.toLowerCase().trim();
    if (!VALID_STAGES.includes(stage)) {
      log("WARN", `[${requestId}] Invalid stage: "${body.stage}" — must be one of: ${VALID_STAGES.join(", ")}`);
      return res.status(400).json({
        success: false,
        requestId,
        error: `Invalid stage: "${body.stage}". Must be one of: ${VALID_STAGES.join(", ")}`,
        validStages: VALID_STAGES,
      });
    }

    log("INFO", `[${requestId}] Production update: ${body.orderId} → ${stage} | By: ${body.updatedBy}${body.notes ? " | Notes: " + body.notes : ""}`);

    return res.status(200).json({
      success: true,
      requestId,
      orderId: body.orderId,
      stage,
      updatedBy: body.updatedBy,
      notes: body.notes || "",
      message: `Order ${body.orderId} production stage updated to "${stage}".`,
    });
  } catch (err) {
    log("ERROR", `[${requestId}] Failed: ${err.message}`);
    return res.status(500).json({
      success: false,
      requestId,
      error: err.message,
    });
  }
});

// ── POST /square-webhook — Square webhook event receiver ────────────────────
/**
 * POST /square-webhook
 * Receives webhook events from Square (invoice payments, cancellations, etc.).
 * Returns 200 OK immediately — Square requires a fast response.
 * All event handling is logged to logs/square.log via the square-client logger.
 * @param {Object} req.body - Square webhook event payload.
 */
app.post("/square-webhook", (req, res) => {
  // Respond immediately — Square times out after 10 seconds
  res.status(200).json({ received: true });

  const requestId = `sw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    const body = req.body || {};
    const eventType = body.type || "unknown";
    const eventId = body.event_id || "(no id)";

    log("INFO", `[${requestId}] POST /square-webhook | Event: ${eventType} | ID: ${eventId}`);

    if (eventType === "invoice.payment_made") {
      const invoiceId = (body.data && body.data.object && body.data.object.invoice && body.data.object.invoice.id) || "(unknown)";
      log("INFO", `[${requestId}] 💰 Payment received for invoice: ${invoiceId}`);
    } else if (eventType === "invoice.canceled") {
      const invoiceId = (body.data && body.data.object && body.data.object.invoice && body.data.object.invoice.id) || "(unknown)";
      log("INFO", `[${requestId}] ❌ Invoice canceled: ${invoiceId}`);
    } else {
      log("INFO", `[${requestId}] Unhandled Square event: ${eventType}`);
    }
  } catch (err) {
    log("ERROR", `[${requestId}] Square webhook processing error: ${err.message}`);
  }
});

// ── Cheeky OS module system ─────────────────────────────────────────────────
const cheekRouter = require("../cheeky-os/routes");
app.use("/cheeky", cheekRouter);

// Serve dashboard static files (index.html, mobile.html)
app.use("/cheeky", express.static(path.join(__dirname, "..", "public", "cheeky")));

// ── 404 handler for unknown routes ──────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.path}`,
    availableRoutes: [
      "GET  /health",
      "POST /intake",
      "POST /order-complete",
      "POST /notify-customer",
      "POST /production-update",
      "POST /square-webhook",
      "GET  /cheeky/health",
      "GET  /cheeky/activity",
      "GET  /cheeky/mobile",
      "GET  /cheeky/voice/commands",
      "POST /cheeky/voice/run",
      "POST /cheeky/voice/shortcut",
      "POST /cheeky/commands/run",
      "GET  /cheeky/autopilot/status",
      "POST /cheeky/autopilot/tick",
      "POST /cheeky/run",
      "POST /cheeky/followups",
      "POST /cheeky/leads",
      "POST /cheeky/quote",
      "POST /cheeky/close",
      "POST /cheeky/intake",
      "POST /cheeky/invoice",
      "POST /cheeky/invoice/create",
      "POST /cheeky/invoice/from-quote",
      "POST /cheeky/build",
      "POST /cheeky/deploy",
      "POST /cheeky/rollback",
      "POST /cheeky/followup2/run",
      "POST /cheeky/followup2/track",
      "POST /cheeky/followup2/mark-paid",
      "GET  /cheeky/followup2/open",
      "GET  /cheeky/followup2/stale",
      "GET  /cheeky/followup2/hot",
      "GET  /cheeky/followup2/next",
      "GET  /cheeky/payments/sync",
      "POST /cheeky/payments/sync",
      "GET  /cheeky/payments/status/:invoiceId",
      "POST /cheeky/payments/webhook",
      "GET  /cheeky/payments/open",
      "GET  /cheeky/payments/paid",
      "GET  /cheeky/data/mode",
      "GET  /cheeky/data/snapshot",
      "GET  /cheeky/data/deals/open",
      "GET  /cheeky/data/events",
      "POST /cheeky/data/customer",
      "POST /cheeky/data/deal",
      "POST /cheeky/data/payment",
    ],
  });
});

// ── Start server immediately ────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { app, PORT };
