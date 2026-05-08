"use strict";

const express = require("express");

const safety = require("../agent/safetyGuard");

const briefing = require("../intelligence/dailyCommandCenter");

const router = express.Router();

router.get("/api/intelligence/daily-command-center", async (req, res) => {
  try {
    safety.auditLog({
      eventType: "intelligence_read",
      taskId: null,
      actor: req.headers["x-actor"] ? String(req.headers["x-actor"]).slice(0, 160) : "http",
      metadata: {
        surface: "daily_command_center",
        route: "/api/intelligence/daily-command-center",
        readOnly: true,
      },
    });
    const payload = await briefing.buildDailyBriefing();
    return res.json({ success: !!payload.success, data: payload });
  } catch (_e) {
    return res.status(500).json({ success: false, error: "briefing_failed" });
  }
});

module.exports = router;
