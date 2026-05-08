"use strict";

const express = require("express");

const nightlyGrowthReviewEngine = require("../operator/nightlyGrowthReviewEngine");
const { safeFailureResponse } = require("../utils/safeFailureResponse");

const router = express.Router();

router.get("/api/operator/nightly-growth-review", async (_req, res) => {
  try {
    const data = await nightlyGrowthReviewEngine.buildNightlyGrowthReview();
    return res.json({ success: true, data });
  } catch (_e) {
    const cached = nightlyGrowthReviewEngine.getCachedNightlyReview();
    if (cached) {
      return res.status(200).json({
        success: true,
        degraded: true,
        data: Object.assign({}, cached, {
          cashWarningsEcho: `${cached.cashWarningsEcho || ""} (Serving last cached nightly package.)`,
        }),
      });
    }
    return res.status(200).json(
      Object.assign(
        safeFailureResponse({ safeMessage: "Nightly review unavailable safely.", technicalCode: "nightly_fail", fallbackUsed: true }),
        {
          data: {
            generatedAt: new Date().toISOString(),
            topRevenueOpportunities: [],
            tomorrowFocus: ["Retry after KPI + ads import completes."],
            growthMomentumScore: 0,
            confidence: 0.2,
            strategyPromptEcho: nightlyGrowthReviewEngine.STRATEGY_PROMPT,
          },
        }
      )
    );
  }
});

module.exports = router;
