/**
 * GET /api/autopilot/plan — deterministic recommendations (read-only).
 * POST /api/autopilot/run — dry-run (default) or safe auto-actions only.
 */

const express = require("express");
const path = require("path");

const router = express.Router();

const autopilot = require(path.join(
  __dirname,
  "..",
  "..",
  "src",
  "services",
  "autopilotService.js"
));

router.get("/plan", async (_req, res) => {
  try {
    const { items } = await autopilot.getAutopilotPlan();
    return res.json({
      success: true,
      count: items.length,
      items,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, error: msg, count: 0, items: [] });
  }
});

router.post("/run", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const out = await autopilot.runAutopilotExecution(body);
    if (!out.success) {
      return res.status(400).json(out);
    }
    return res.json(out);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, error: msg });
  }
});

module.exports = router;
