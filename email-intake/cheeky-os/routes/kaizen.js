/**
 * GET /api/system/kaizen — Kaizen analysis over memory events.
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

router.get("/kaizen", async (_req, res) => {
  try {
    const insights = await memoryService.analyzeMemory();
    return res.json({
      success: true,
      insights,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({
      success: false,
      insights: "",
      error: msg,
    });
  }
});

module.exports = router;
