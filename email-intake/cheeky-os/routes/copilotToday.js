/**
 * Bundle 18 — GET /copilot/today
 */

const { Router } = require("express");
const {
  getCopilotTodayPayload,
  fallbackCopilot,
} = require("../services/copilotService");

const router = Router();

router.get("/today", async (_req, res) => {
  try {
    const data = await getCopilotTodayPayload();
    return res.json({
      message: data.message || "",
      topActions: data.topActions || [],
      alerts: data.alerts || [],
      suggestions: data.suggestions || [],
    });
  } catch (err) {
    console.error("[copilot/today]", err.message || err);
    const fb = fallbackCopilot();
    return res.json({
      message: fb.message,
      topActions: fb.topActions,
      alerts: fb.alerts,
      suggestions: fb.suggestions,
    });
  }
});

module.exports = router;
