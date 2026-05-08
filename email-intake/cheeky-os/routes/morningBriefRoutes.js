"use strict";

const express = require("express");

const morningBriefEngine = require("../operator/morningBriefEngine");
const { safeFailureResponse } = require("../utils/safeFailureResponse");

const router = express.Router();

router.get("/api/operator/morning-brief", async (_req, res) => {
  try {
    const data = await morningBriefEngine.buildMorningBrief();
    return res.json({ success: true, data });
  } catch (_e) {
    const cached = morningBriefEngine.getCachedMorningBrief();
    if (cached)
      return res.status(200).json({
        success: true,
        degraded: true,
        data: Object.assign({}, cached, {
          operationalSummary:
            `${cached.operationalSummary || ""}\nServing last cached executive brief until live assembly recovers.`,
        }),
      });
    return res.status(200).json(
      Object.assign(
        safeFailureResponse({
          safeMessage: "Morning brief unavailable — open blockers cockpit and retry.",
          technicalCode: "morning_brief_failed",
          fallbackUsed: true,
        }),
        {
          data: {
            generatedAt: new Date().toISOString(),
            topPriorities: ["Briefing degraded — rerun after approvals + dashboard respond."],
            jeremyFocus: ["Stay on blocker-first cockpit — no outbound sends."],
            patrickApprovals: [],
            growthOpportunities: [],
            cashWarnings: [],
            outreachRecommendations: [],
            kpiSnapshot: {},
            operationalSummary: "Deferred until fresh brief caches.",
            confidence: 0.2,
          },
        }
      )
    );
  }
});

module.exports = router;
