"use strict";

const express = require("express");
const router = express.Router();
const { getLatestAgentInsights, runAgentLoop } = require("../services/agentLoop");

router.get("/api/operator/agent-insights", async (_req, res) => {
  try {
    let insights = getLatestAgentInsights();

    if (!insights || !Array.isArray(insights.followUpsNeeded)) {
      const refresh = await runAgentLoop();
      if (refresh && refresh.success) {
        insights = getLatestAgentInsights();
      }
    }

    return res.json({
      success: true,
      followUpsNeeded: (insights && insights.followUpsNeeded) || [],
      readyForGarments: (insights && insights.readyForGarments) || [],
      stuckOrders: (insights && insights.stuckOrders) || [],
      printingQueueCount: Number((insights && insights.printingQueueCount) || 0),
      timestamp: (insights && insights.timestamp) || new Date().toISOString(),
    });
  } catch (_err) {
    return res.json({
      success: true,
      followUpsNeeded: [],
      readyForGarments: [],
      stuckOrders: [],
      printingQueueCount: 0,
      timestamp: new Date().toISOString(),
    });
  }
});

module.exports = router;
