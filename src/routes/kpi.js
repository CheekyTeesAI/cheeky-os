"use strict";

const express = require("express");
const router = express.Router();

const { getKPIs } = require("../services/kpiService");

router.get("/api/kpi", async (_req, res) => {
  try {
    const data = await getKPIs();
    return res.json({
      success: true,
      data,
    });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "kpi_fetch_failed",
    });
  }
});

module.exports = router;
