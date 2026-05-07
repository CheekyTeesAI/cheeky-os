"use strict";

const express = require("express");
const router = express.Router();

const { getCashflow } = require("../services/cashflowService");
const { getDailyTarget } = require("../services/targetService");

/** Legacy revenue-style cashflow summary at GET / (mounted at /api/cashflow in server). */
router.get("/", async (_req, res) => {
  try {
    const cash = await getCashflow();
    const target = getDailyTarget();

    return res.json({
      success: true,
      data: {
        unpaid: cash.unpaid,
        pipeline: cash.pipeline,
        collected: cash.collected,
        total: cash.total,
        monthlyGoal: target.monthlyGoal,
        dailyTarget: target.dailyTarget,
      },
    });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "cashflow_failed",
    });
  }
});

module.exports = router;
