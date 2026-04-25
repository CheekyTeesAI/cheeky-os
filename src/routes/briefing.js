const express = require("express");
const { generateDailyBriefing } = require("../services/briefingService");

const router = express.Router();
router.use(express.json());

router.post("/briefing/generate", async (req, res) => {
  try {
    const payload = req.body && typeof req.body === "object" ? req.body : {};
    const result = await generateDailyBriefing(payload);
    return res.status(200).json({
      success: true,
      route: "/briefing/generate",
      mocked_delivery: result.mocked === true,
      open_collections_total: result.open_collections_total,
      open_collections_count: result.open_collections_count,
      top_action: result.action_queue && result.action_queue[0] ? result.action_queue[0] : null,
      generated_at: result.generated_at,
      delivery: result.delivery,
      brief_text: result.brief_text,
    });
  } catch (error) {
    console.error("[briefingRoute] generate failed:", error && error.message ? error.message : error);
    return res.status(500).json({
      success: false,
      error: error && error.message ? error.message : "briefing generation failed",
      timestamp: new Date().toISOString(),
    });
  }
});

module.exports = router;
