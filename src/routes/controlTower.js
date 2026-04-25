/**
 * GET /control-tower — aggregated snapshot for owner dashboard.
 */
const express = require("express");
const { buildControlTowerPayload } = require("../services/controlTowerService");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const data = await buildControlTowerPayload(req.app);
    return res.status(200).json({
      success: true,
      time: new Date().toISOString(),
      ...data,
    });
  } catch (e) {
    return res.status(200).json({
      success: false,
      time: new Date().toISOString(),
      error: e && e.message ? e.message : "control_tower_failed",
    });
  }
});

module.exports = router;
