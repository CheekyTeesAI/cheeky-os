/**
 * Test suite for integrations/square-client.js.
 * Uses Node's built-in test runner (node:test, node:assert).
 * All tests mock the global fetch to avoid real Square API calls.
 * Verifies that every failure returns { success: false } and never throws.
 *
 * Run with: node --test tests/test-square.js
 */

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

// Ensure dotenv is loaded and Square is NOT configured by default
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

// Save original env values and clear Square config for controlled testing
const origToken = process.env.SQUARE_ACCESS_TOKEN;
const origLocation = process.env.SQUARE_LOCATION_ID;
const origEnv = process.env.SQUARE_ENVIRONMENT;

/** Helper: set Square env vars for tests. */
function configureSquare() {
  process.env.SQUARE_ACCESS_TOKEN = "test-sandbox-token";
  process.env.SQUARE_LOCATION_ID = "test-location-id";
  process.env.SQUARE_ENVIRONMENT = "sandbox";
}

/** Helper: clear Square env vars. */
function clearSquare() {
  process.env.SQUARE_ACCESS_TOKEN = "";
  process.env.SQUARE_LOCATION_ID = "";
  process.env.SQUARE_ENVIRONMENT = "sandbox";
}

/** Helper: mock global fetch to return controlled responses. */
function mockFetch(responses) {
  const calls = [];
  const queue = Array.isArray(responses) ? [...responses] : [];
  const defaultResponse = !Array.isArray(responses) ? responses : null;

  global.fetch = async (url, options) => {
    calls.push({ url, options });
    const resp = queue.length > 0 ? queue.shift() : defaultResponse;
    return {
      ok: resp.ok,
      status: resp.status || (resp.ok ? 200 : 500),
      json: async () => resp.body || {},
      text: async () => JSON.stringify(resp.body || {}),
    };
  };
  return calls;
}

// We need to re-require the module for each test since it reads env at load time.
// Use a fresh require by clearing the cache.
function freshRequireSquare() {
  const modPath = require.resolve("../integrations/square-client");
  const mapperPath = require.resolve("../integrations/square-mapper");
  delete require.cache[modPath];
  delete require.cache[mapperPath];
  return require("../integrations/square-client");
}

describe("Square Client Tests", () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    // Restore original env
    process.env.SQUARE_ACCESS_TOKEN = origToken || "";
    process.env.SQUARE_LOCATION_ID = origLocation || "";
    process.env.SQUARE_ENVIRONMENT = origEnv || "sandbox";
  });

  // ── getOrCreateCustomer — not configured ─────────────────────────────────
  it("getOrCreateCustomer returns { success: false } when not configured", async () => {
    clearSquare();
    const sq = freshRequireSquare();
    const result = await sq.getOrCreateCustomer("test@test.com", "Test", "555-1234");
    assert.equal(result.success, false);
    assert.ok(result.error.includes("not configured"));
  });

  // ── getOrCreateCustomer — finds existing customer ────────────────────────
  it("getOrCreateCustomer finds existing customer by email", async () => {
    configureSquare();
    const calls = mockFetch({
      ok: true,
      body: { customers: [{ id: "cust-123", given_name: "Test", family_name: "User" }] },
    });
    const sq = freshRequireSquare();
    const result = await sq.getOrCreateCustomer("test@test.com", "Test User", "555-1234");
    assert.equal(result.success, true);
    assert.equal(result.customerId, "cust-123");
    assert.equal(result.isNew, false);
    assert.ok(calls.length >= 1);
  });

  // ── getOrCreateCustomer — creates new customer ───────────────────────────
  it("getOrCreateCustomer creates new customer when not found", async () => {
    configureSquare();
    const calls = mockFetch([
      // Search returns empty
      { ok: true, body: { customers: [] } },
      // Create returns new customer
      { ok: true, body: { customer: { id: "cust-new-456" } } },
    ]);
    const sq = freshRequireSquare();
    const result = await sq.getOrCreateCustomer("new@test.com", "New Customer", "555-5678");
    assert.equal(result.success, true);
    assert.equal(result.customerId, "cust-new-456");
    assert.equal(result.isNew, true);
    assert.equal(calls.length, 2);
  });

  // ── getOrCreateCustomer — API failure ────────────────────────────────────
  it("getOrCreateCustomer handles API failure gracefully", async () => {
    configureSquare();
    mockFetch({ ok: false, status: 500, body: { errors: [{ detail: "Server error" }] } });
    const sq = freshRequireSquare();
    const result = await sq.getOrCreateCustomer("fail@test.com", "Fail User", "");
    // Should not throw — returns { success: false }
    assert.equal(result.success, false);
    assert.ok(result.error);
  });

  // ── createEstimate — valid data ──────────────────────────────────────────
  it("createEstimate with valid order data returns estimate ID", async () => {
    configureSquare();
    const calls = mockFetch([
      // Customer search — empty
      { ok: true, body: { customers: [] } },
      // Customer create
      { ok: true, body: { customer: { id: "cust-est-1" } } },
      // Order create
      { ok: true, body: { order: { id: "order-est-1" } } },
      // Invoice create
      { ok: true, body: { invoice: { id: "inv-est-1", public_url: "https://squareup.com/inv/1" } } },
    ]);
    const sq = freshRequireSquare();
    const result = await sq.createEstimate({
      customerName: "Test Customer",
      email: "est@test.com",
      product: "T-Shirts",
      quantity: "50",
      printType: "screen print",
      deadline: "2026-06-01",
    });
    assert.equal(result.success, true);
    assert.equal(result.estimateId, "inv-est-1");
    assert.ok(calls.length >= 3);
  });

  // ── createEstimate — API failure ─────────────────────────────────────────
  it("createEstimate handles API failure gracefully", async () => {
    configureSquare();
    mockFetch([
      // Customer search — empty
      { ok: true, body: { customers: [] } },
      // Customer create — fail
      { ok: false, status: 401, body: { errors: [{ detail: "Unauthorized" }] } },
    ]);
    const sq = freshRequireSquare();
    const result = await sq.createEstimate({
      customerName: "Fail Test",
      email: "fail@test.com",
      product: "Hoodies",
      quantity: "10",
    });
    assert.equal(result.success, false);
    assert.ok(result.error);
  });

  // ── createInvoice — valid data ───────────────────────────────────────────
  it("createInvoice with valid order data returns invoice ID", async () => {
    configureSquare();
    mockFetch([
      // Customer search — empty
      { ok: true, body: { customers: [] } },
      // Customer create
      { ok: true, body: { customer: { id: "cust-inv-1" } } },
      // Order create
      { ok: true, body: { order: { id: "order-inv-1" } } },
      // Invoice create (draft)
      { ok: true, body: { invoice: { id: "inv-draft-1", version: 0, public_url: "https://squareup.com/inv/d1" } } },
      // Invoice GET (for version)
      { ok: true, body: { invoice: { id: "inv-draft-1", version: 0 } } },
      // Invoice publish
      { ok: true, body: { invoice: { id: "inv-draft-1", status: "UNPAID", public_url: "https://squareup.com/inv/d1" } } },
    ]);
    const sq = freshRequireSquare();
    const result = await sq.createInvoice({
      customerName: "Invoice Test",
      email: "inv@test.com",
      product: "Jerseys",
      quantity: "100",
      printType: "sublimation",
      deadline: "2026-07-01",
    });
    assert.equal(result.success, true);
    assert.equal(result.invoiceId, "inv-draft-1");
    assert.equal(result.published, true);
  });

  // ── createInvoice — API failure ──────────────────────────────────────────
  it("createInvoice handles API failure gracefully", async () => {
    configureSquare();
    mockFetch({ ok: false, status: 500, body: { errors: [{ detail: "Internal error" }] } });
    const sq = freshRequireSquare();
    const result = await sq.createInvoice({
      customerName: "Fail Invoice",
      email: "failinv@test.com",
      product: "Hats",
      quantity: "200",
    });
    assert.equal(result.success, false);
    assert.ok(result.error);
  });

  // ── All failures return { success: false } and never throw ───────────────
  it("All functions return { success: false } on network error — never throw", async () => {
    configureSquare();
    global.fetch = async () => { throw new Error("Network timeout"); };
    const sq = freshRequireSquare();

    const custResult = await sq.getOrCreateCustomer("net@test.com", "Net Fail", "");
    assert.equal(custResult.success, false);
    assert.ok(custResult.error.includes("Network timeout"));

    const estResult = await sq.createEstimate({ customerName: "Net Fail", email: "net@test.com" });
    assert.equal(estResult.success, false);

    const invResult = await sq.createInvoice({ customerName: "Net Fail", email: "net@test.com" });
    assert.equal(invResult.success, false);
  });
});
