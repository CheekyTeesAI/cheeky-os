/**
 * POST /api/orders/:id/garments/mark-ordered
 * POST /api/orders/:id/garments/mark-received
 */

const express = require("express");
const path = require("path");

const memoryService = require(path.join(
  __dirname,
  "..",
  "..",
  "src",
  "services",
  "memoryService.js"
));

const router = express.Router();

function loadService() {
  try {
    return require(path.join(
      __dirname,
      "..",
      "..",
      "dist",
      "services",
      "garmentOperatorService.js"
    ));
  } catch {
    return null;
  }
}

router.post("/:id/garments/mark-ordered", async (req, res) => {
  const m = loadService();
  if (!m || typeof m.markGarmentsOrdered !== "function") {
    return res.status(503).json({
      success: false,
      error: "Garment module unavailable — run `npm run build`",
    });
  }
  const id = String(req.params.id || "").trim();
  if (!id) {
    return res.status(400).json({ success: false, error: "Missing order id" });
  }
  try {
    const out = await m.markGarmentsOrdered(id);
    try {
      if (out && out.success) {
        memoryService.logEvent("garment_ordered", { orderId: id });
      }
    } catch (_) {
      /* optional */
    }
    return res.json(out);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Order not found")) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }
    console.error("[mark-ordered]", msg);
    return res.status(500).json({ success: false, error: msg });
  }
});

router.post("/:id/garments/mark-received", async (req, res) => {
  const m = loadService();
  if (!m || typeof m.markGarmentsReceived !== "function") {
    return res.status(503).json({
      success: false,
      error: "Garment module unavailable — run `npm run build`",
    });
  }
  const id = String(req.params.id || "").trim();
  if (!id) {
    return res.status(400).json({ success: false, error: "Missing order id" });
  }
  try {
    const out = await m.markGarmentsReceived(id);
    return res.json(out);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Order not found")) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }
    console.error("[mark-received]", msg);
    return res.status(500).json({ success: false, error: msg });
  }
});

module.exports = router;
