const express = require("express");
const { runCollections } = require("../services/collectionsService");

const router = express.Router();
router.use(express.json());

router.post("/run", async (req, res) => {
  try {
    const payload = req.body && typeof req.body === "object" ? req.body : {};
    const result = await runCollections(payload);
    return res.status(200).json({
      success: true,
      route: "/collections/run",
      source: result.source || "mock",
      mocked: result.mocked === true,
      items_count: Array.isArray(result.items) ? result.items.length : 0,
      items: Array.isArray(result.items) ? result.items : [],
      diagnostics: {
        reason: result.reason || null,
        square_enabled: Boolean(String(process.env.SQUARE_ACCESS_TOKEN || "").trim()),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[collectionsRoute] /run failed:", error && error.message ? error.message : error);
    return res.status(500).json({
      success: false,
      error: error && error.message ? error.message : "collections run failed",
      items: [],
      timestamp: new Date().toISOString(),
    });
  }
});

module.exports = router;
