"use strict";

const express = require("express");
const router = express.Router();

const { refreshPredictions, getUpcomingPredictions } = require("../services/predictionStore");

router.get("/api/predictions", async (_req, res) => {
  try {
    const list = await getUpcomingPredictions();
    return res.json({
      success: true,
      data: list,
    });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "predictions_fetch_failed",
    });
  }
});

router.post("/api/predictions/run", async (_req, res) => {
  try {
    await refreshPredictions();
    return res.json({
      success: true,
      message: "Predictions refreshed",
    });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "predictions_refresh_failed",
    });
  }
});

module.exports = router;
