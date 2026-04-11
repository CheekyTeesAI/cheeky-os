/**
 * Cheeky OS — Health endpoint test.
 * Validates GET /cheeky/health returns correct structure.
 */

const express = require("express");
const request = require("supertest");

// Build a minimal app with just the cheeky router mounted
const cheekRouter = require("../routes");
const app = express();
app.use(express.json());
app.use("/cheeky", cheekRouter);

describe("GET /cheeky/health", () => {
  it("should return 200 with ok:true and system data", async () => {
    const res = await request(app).get("/cheeky/health");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.status).toBe("healthy");
    expect(res.body.data.service).toBe("Cheeky OS v1");
    expect(res.body.data.uptime).toBeDefined();
    expect(res.body.data.node).toBeDefined();
    expect(res.body.data.memory).toBeDefined();
    expect(res.body.error).toBeNull();
  });
});

describe("GET /cheeky/activity", () => {
  it("should return 200 with activity log buffer", async () => {
    const res = await request(app).get("/cheeky/activity");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data.entries)).toBe(true);
    expect(typeof res.body.data.count).toBe("number");
  });
});

describe("GET /cheeky/voice/commands", () => {
  it("should return available voice commands", async () => {
    const res = await request(app).get("/cheeky/voice/commands");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.data.intents)).toBe(true);
    expect(res.body.data.intents.length).toBeGreaterThan(0);
    expect(Array.isArray(res.body.data.examples)).toBe(true);
  });
});

describe("POST /cheeky/quote", () => {
  it("should generate a quote with valid input", async () => {
    const res = await request(app)
      .post("/cheeky/quote")
      .send({ customer: "Test Co", product: "T-Shirt", quantity: 25 });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.customer).toBe("Test Co");
    expect(res.body.data.quantity).toBe(25);
    expect(res.body.data.total).toBeGreaterThan(0);
    expect(res.body.data.discount_pct).toBe(10); // 25 units = 10% discount
  });

  it("should reject quote with missing fields", async () => {
    const res = await request(app)
      .post("/cheeky/quote")
      .send({ customer: "Test Co" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toContain("Missing");
  });
});

describe("POST /cheeky/close", () => {
  it("should close a deal", async () => {
    const res = await request(app)
      .post("/cheeky/close")
      .send({ customer: "Murphy's Pub", order_id: "ORD-123" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.status).toBe("CLOSED");
  });
});

describe("POST /cheeky/voice/shortcut", () => {
  it("should execute a known shortcut", async () => {
    const res = await request(app)
      .post("/cheeky/voice/shortcut")
      .send({ intent: "GET_HEALTH" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data.intent).toBe("GET_HEALTH");
  });

  it("should reject unknown intent", async () => {
    const res = await request(app)
      .post("/cheeky/voice/shortcut")
      .send({ intent: "FLY_TO_MOON" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toContain("Unknown intent");
  });
});
