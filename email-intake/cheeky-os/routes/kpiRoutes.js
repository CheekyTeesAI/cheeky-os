"use strict";

const express = require("express");

const kpiService = require("../kpi/kpiService");
const { safeFailureResponse } = require("../utils/safeFailureResponse");

const router = express.Router();

router.get("/api/kpi/summary", async (_req, res) => {
  try {
    const summary = await kpiService.buildKpiSummary();
    return res.json({ success: true, data: summary });
  } catch (_e) {
    return res.status(200).json(
      Object.assign(safeFailureResponse({ safeMessage: "KPI summary deferred safely.", technicalCode: "kpi_summary_fail" }), {
        data: null,
      })
    );
  }
});

module.exports = router;
