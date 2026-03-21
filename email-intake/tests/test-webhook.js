/**
 * Test suite for webhook/server.js endpoints.
 * Uses Node's built-in test runner (node:test, node:assert).
 * Tests run against the Express app directly using lightweight
 * HTTP requests — no real Dataverse or external calls.
 *
 * Run with: node --test tests/test-webhook.js
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");

// Load dotenv so server.js can read PORT
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

// Use a random high port to avoid conflicts
const TEST_PORT = 49200 + Math.floor(Math.random() * 500);
process.env.PORT = String(TEST_PORT);
// Disable webhook secret for testing
process.env.WEBHOOK_SECRET = "";

// Stub out the intake module so we never call Dataverse
const intakePath = require.resolve("../intake");
const originalIntake = require(intakePath);
require.cache[intakePath] = {
  id: intakePath,
  filename: intakePath,
  loaded: true,
  exports: {
    ...originalIntake,
    handleWebhook: async (json) => ({
      recordId: "test-record-id-12345",
      mapped: { customerName: json.customerName || "Test", product: json.product || "Shirts" },
    }),
  },
};

const { app } = require("../webhook/server");

/**
 * Lightweight HTTP request helper. Returns { status, body }.
 * @param {string} method - HTTP method.
 * @param {string} path   - URL path.
 * @param {Object} [body] - JSON body.
 * @returns {Promise<{status: number, body: Object}>}
 */
function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "127.0.0.1",
      port: TEST_PORT,
      path,
      method,
      headers: { "Content-Type": "application/json" },
    };
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe("Webhook Server Tests", () => {
  let server;

  before(async () => {
    await new Promise((resolve) => {
      server = app.listen(TEST_PORT, resolve);
    });
  });

  after(async () => {
    await new Promise((resolve) => {
      if (server) server.close(resolve);
      else resolve();
    });
  });

  // ── GET /health ──────────────────────────────────────────────────────────
  it("GET /health returns 200 with status ok", async () => {
    const res = await request("GET", "/health");
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "ok");
    assert.ok(res.body.uptime);
    assert.ok(res.body.startedAt);
  });

  // ── POST /intake — valid payload ─────────────────────────────────────────
  it("POST /intake with valid JSON returns 201", async () => {
    const res = await request("POST", "/intake", {
      customerName: "Test Customer",
      product: "T-Shirts",
      quantity: "50",
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.ok(res.body.requestId);
    assert.equal(res.body.recordId, "test-record-id-12345");
  });

  // ── POST /intake — missing fields ────────────────────────────────────────
  it("POST /intake with missing required fields returns 400", async () => {
    const res = await request("POST", "/intake", {});
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.ok(res.body.error);
  });

  // ── POST /order-complete — valid payload ─────────────────────────────────
  it("POST /order-complete with valid payload returns 200", async () => {
    const res = await request("POST", "/order-complete", {
      orderId: "test-order-123",
      customerName: "Test Customer",
      email: "test@example.com",
      product: "T-Shirts",
      quantity: "50",
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.message.includes("test-order-123"));
  });

  // ── POST /order-complete — missing fields ────────────────────────────────
  it("POST /order-complete with missing fields returns 400", async () => {
    const res = await request("POST", "/order-complete", {
      orderId: "test-order-123",
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.ok(res.body.error.includes("Missing required"));
  });

  // ── POST /notify-customer — valid payload ────────────────────────────────
  it("POST /notify-customer with valid payload returns 200", async () => {
    const res = await request("POST", "/notify-customer", {
      email: "test@example.com",
      customerName: "Test Customer",
      orderId: "test-order-123",
      status: "shipped",
      message: "Your order has shipped!",
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.notified, true);
    assert.equal(res.body.email, "test@example.com");
  });

  // ── POST /production-update — valid stage ────────────────────────────────
  it("POST /production-update with valid stage returns 200", async () => {
    const res = await request("POST", "/production-update", {
      orderId: "test-order-123",
      stage: "printing",
      updatedBy: "Chad",
      notes: "Started screen print run",
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.stage, "printing");
    assert.equal(res.body.updatedBy, "Chad");
  });

  // ── POST /production-update — invalid stage ──────────────────────────────
  it("POST /production-update with invalid stage returns 400", async () => {
    const res = await request("POST", "/production-update", {
      orderId: "test-order-123",
      stage: "cooking",
      updatedBy: "Chad",
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.ok(res.body.error.includes("Invalid stage"));
    assert.deepEqual(res.body.validStages, ["received", "art", "printing", "finished", "shipped"]);
  });

  // ── POST /square-webhook — event handling ────────────────────────────────
  it("POST /square-webhook returns 200 immediately", async () => {
    const res = await request("POST", "/square-webhook", {
      type: "invoice.payment_made",
      event_id: "evt-test-123",
      data: { object: { invoice: { id: "inv-test-456" } } },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.received, true);
  });

  // ── 404 for unknown routes ───────────────────────────────────────────────
  it("Unknown route returns 404 with available routes", async () => {
    const res = await request("GET", "/does-not-exist");
    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
    assert.ok(Array.isArray(res.body.availableRoutes));
  });
});
