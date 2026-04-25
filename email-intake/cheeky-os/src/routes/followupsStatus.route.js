"use strict";

const express = require("express");
const router = express.Router();
const {
  getFollowupsStatus,
  getFollowupsQueue,
  getFollowupsAudit,
} = require("../services/followupAutomation");

router.get("/api/operator/followups/status", async (_req, res) => {
  try {
    return res.json(getFollowupsStatus());
  } catch (_err) {
    return res.json({
      mode: String(process.env.FOLLOWUP_MODE || "draft_only"),
      autoSend: String(process.env.FOLLOWUP_AUTO_SEND || "false").toLowerCase() === "true",
      draftedToday: 0,
      sentToday: 0,
      blockedToday: 0,
      skippedToday: 0,
      timestamp: new Date().toISOString(),
    });
  }
});

router.get("/api/operator/followups/queue", async (_req, res) => {
  try {
    return res.json(getFollowupsQueue());
  } catch (_err) {
    return res.json({
      success: true,
      items: [],
      timestamp: new Date().toISOString(),
    });
  }
});

router.get("/api/operator/followups/audit", async (_req, res) => {
  try {
    return res.json(getFollowupsAudit());
  } catch (_err) {
    return res.json({
      success: true,
      items: [],
      timestamp: new Date().toISOString(),
    });
  }
});

module.exports = router;
