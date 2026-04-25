/**
 * Proof / mockup approval — Order.proof* + stub email.
 */

const express = require("express");
const path = require("path");

const router = express.Router();

const memoryService = require(path.join(
  __dirname,
  "..",
  "..",
  "src",
  "services",
  "memoryService.js"
));

function loadProofModule() {
  try {
    return require(path.join(
      __dirname,
      "..",
      "..",
      "dist",
      "services",
      "proofRoutingService.js"
    ));
  } catch {
    return null;
  }
}

router.get("/queue", async (_req, res) => {
  const mod = loadProofModule();
  if (!mod || typeof mod.listOrdersProofQueue !== "function") {
    return res.status(503).json({
      success: false,
      error: "Proof module unavailable — run `npm run build` in email-intake",
      orders: [],
    });
  }
  try {
    const orders = await mod.listOrdersProofQueue();
    return res.json({ success: true, orders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, error: msg, orders: [] });
  }
});

router.post("/send", async (req, res) => {
  const mod = loadProofModule();
  if (!mod || typeof mod.sendProofForOrder !== "function") {
    return res.status(503).json({
      success: false,
      error: "Proof module unavailable — run `npm run build` in email-intake",
    });
  }
  const orderId = String((req.body && req.body.orderId) || "").trim();
  if (!orderId) {
    return res.status(400).json({ success: false, error: "orderId required" });
  }
  try {
    const out = await mod.sendProofForOrder(orderId);
    try {
      memoryService.logEvent("proof_sent", { orderId });
    } catch (_) {
      /* optional */
    }
    return res.json({ success: true, ...out });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("not found")) {
      return res.status(404).json({ success: false, error: msg });
    }
    return res.status(500).json({ success: false, error: msg });
  }
});

router.post("/approve", async (req, res) => {
  const mod = loadProofModule();
  if (!mod || typeof mod.approveProof !== "function") {
    return res.status(503).json({
      success: false,
      error: "Proof module unavailable — run `npm run build` in email-intake",
    });
  }
  const orderId = String((req.body && req.body.orderId) || "").trim();
  if (!orderId) {
    return res.status(400).json({ success: false, error: "orderId required" });
  }
  try {
    await mod.approveProof(orderId);
    try {
      memoryService.logEvent("proof_approved", { orderId });
    } catch (_) {
      /* optional */
    }
    return res.json({ success: true, orderId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("not found")) {
      return res.status(404).json({ success: false, error: msg });
    }
    return res.status(500).json({ success: false, error: msg });
  }
});

router.post("/reject", async (req, res) => {
  const mod = loadProofModule();
  if (!mod || typeof mod.rejectProof !== "function") {
    return res.status(503).json({
      success: false,
      error: "Proof module unavailable — run `npm run build` in email-intake",
    });
  }
  const orderId = String((req.body && req.body.orderId) || "").trim();
  if (!orderId) {
    return res.status(400).json({ success: false, error: "orderId required" });
  }
  try {
    await mod.rejectProof(orderId);
    try {
      memoryService.logEvent("proof_rejected", { orderId });
    } catch (_) {
      /* optional */
    }
    return res.json({ success: true, orderId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("not found")) {
      return res.status(404).json({ success: false, error: msg });
    }
    return res.status(500).json({ success: false, error: msg });
  }
});

/** Manual / low-friction testing — tokenless; keep internal. */
router.get("/approve", async (req, res) => {
  const mod = loadProofModule();
  if (!mod || typeof mod.approveProof !== "function") {
    return res.status(503).type("html")
      .send("<p>Proof module unavailable.</p>");
  }
  const orderId = String((req.query && req.query.orderId) || "").trim();
  if (!orderId) {
    return res.status(400).type("html")
      .send("<p>Missing orderId query parameter.</p>");
  }
  try {
    await mod.approveProof(orderId);
    try {
      memoryService.logEvent("proof_approved", { orderId });
    } catch (_) {}
    return res.type("html").send(
      "<p>Proof marked approved. You can close this tab.</p>"
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(404).type("html").send("<p>" + msg + "</p>");
  }
});

router.get("/reject", async (req, res) => {
  const mod = loadProofModule();
  if (!mod || typeof mod.rejectProof !== "function") {
    return res.status(503).type("html")
      .send("<p>Proof module unavailable.</p>");
  }
  const orderId = String((req.query && req.query.orderId) || "").trim();
  if (!orderId) {
    return res.status(400).type("html")
      .send("<p>Missing orderId query parameter.</p>");
  }
  try {
    await mod.rejectProof(orderId);
    try {
      memoryService.logEvent("proof_rejected", { orderId });
    } catch (_) {}
    return res.type("html").send(
      "<p>Proof marked rejected. You can close this tab.</p>"
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(404).type("html").send("<p>" + msg + "</p>");
  }
});

module.exports = router;
