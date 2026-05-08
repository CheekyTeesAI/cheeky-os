"use strict";

const express = require("express");

const systemHealthService = require("../monitoring/systemHealthService");
const { safeFailureResponse } = require("../utils/safeFailureResponse");

const router = express.Router();

router.get("/api/monitoring/system-health", async (_req, res) => {
  try {
    const data = await systemHealthService.buildSystemHealthSummary();
    return res.json({ success: true, data });
  } catch (_e) {
    return res.status(200).json(
      Object.assign(safeFailureResponse({ safeMessage: "System health paused safely.", technicalCode: "monitoring_health_fail", fallbackUsed: true }), {
        data: {
          healthScore: 0.2,
          operationalConfidence: 0.2,
          warnings: ["Health assembly deferred — dashboards still load elsewhere."],
          blockers: [],
          connectorStatus: { prismaReadable: false, squareCache: "unknown" },
          generatedAt: new Date().toISOString(),
        },
      })
    );
  }
});

module.exports = router;
