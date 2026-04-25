/**
 * GET /api/operator/garment-orders (mirrored at /operator/garment-orders)
 */

const express = require("express");
const path = require("path");

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

router.get("/garment-orders", async (_req, res) => {
  const m = loadService();
  if (!m || typeof m.buildGarmentOrdersPayload !== "function") {
    return res.status(503).json({
      success: false,
      error: "Garment operator module unavailable — run `npm run build` in email-intake",
    });
  }
  try {
    const body = await m.buildGarmentOrdersPayload();
    return res.json(body);
  } catch (err) {
    console.error("[garment-orders]", err.message || err);
    return res.json({
      success: true,
      count: 0,
      groups: [],
      items: [],
      warning: err instanceof Error ? err.message : "error",
    });
  }
});

module.exports = router;
