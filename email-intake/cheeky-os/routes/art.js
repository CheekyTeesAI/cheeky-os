/**
 * Art routing — PostgreSQL Order.artFileStatus + digitizer stub (Peter).
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
const artRouterCompat = require(path.join(
  __dirname,
  "..",
  "..",
  "src",
  "services",
  "artRouter.js"
));

function loadArtModule() {
  try {
    return require(path.join(
      __dirname,
      "..",
      "..",
      "dist",
      "services",
      "artRoutingService.js"
    ));
  } catch {
    return null;
  }
}

router.get("/needed", async (_req, res) => {
  const art = loadArtModule();
  if (!art || typeof art.listOrdersNeedingArt !== "function") {
    return res.status(503).json({
      success: false,
      error: "Art module unavailable — run `npm run build` in email-intake",
      orders: [],
    });
  }
  try {
    const orders = await art.listOrdersNeedingArt();
    return res.json({ success: true, orders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, error: msg, orders: [] });
  }
});

router.post("/route", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const routed = artRouterCompat.routeToPeter(body);
    return res.json({ success: true, route: routed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, error: msg });
  }
});

router.post("/send-to-digitizer", async (req, res) => {
  const art = loadArtModule();
  if (!art || typeof art.sendOrderToDigitizer !== "function") {
    return res.status(503).json({
      success: false,
      error: "Art module unavailable — run `npm run build` in email-intake",
    });
  }
  const orderId = String((req.body && req.body.orderId) || "").trim();
  if (!orderId) {
    return res.status(400).json({ success: false, error: "orderId required" });
  }
  try {
    const out = await art.sendOrderToDigitizer(orderId);
    try {
      memoryService.logEvent("art_sent_to_digitizer", { orderId });
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

router.post("/mark-ready", async (req, res) => {
  const art = loadArtModule();
  if (!art || typeof art.markArtReady !== "function") {
    return res.status(503).json({
      success: false,
      error: "Art module unavailable — run `npm run build` in email-intake",
    });
  }
  const orderId = String((req.body && req.body.orderId) || "").trim();
  if (!orderId) {
    return res.status(400).json({ success: false, error: "orderId required" });
  }
  try {
    await art.markArtReady(orderId);
    try {
      memoryService.logEvent("art_marked_ready", { orderId });
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

module.exports = router;
