"use strict";

const express = require("express");
const router = express.Router();
const { getDashboardData } = require("../services/dashboardService");

router.get("/api/dashboard", async (_req, res) => {
  try {
    const data = await getDashboardData();
    return res.status(200).json({ success: true, data });
  } catch (e) {
    return res.status(500).json({
      success: false,
      error: e && e.message ? e.message : "internal_error",
      code: "INTERNAL_ERROR",
    });
  }
});

module.exports = router;
