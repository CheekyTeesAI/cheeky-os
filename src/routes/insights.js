"use strict";

const express = require("express");
const router = express.Router();

const { getInsights } = require("../services/insightService");

router.get("/api/insights", async (_req, res) => {
  try {
    const data = await getInsights();
    return res.json({
      success: true,
      data,
    });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "insights_fetch_failed",
    });
  }
});

module.exports = router;
