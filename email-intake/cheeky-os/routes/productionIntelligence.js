"use strict";

const express = require("express");

const safety = require("../agent/safetyGuard");

const prod = require("../connectors/productionReadConnector");

const router = express.Router();

function audit(req, routePath) {
  try {
    safety.auditLog({
      eventType: "intelligence_read",
      taskId: null,
      actor: req.headers["x-actor"] ? String(req.headers["x-actor"]).slice(0, 160) : "http",
      metadata: { surface: "production_read", route: routePath, readOnly: true },
    });
  } catch (_e) {}
}

router.get("/api/intelligence/production/queue", (req, res) => {
  try {
    audit(req, "/api/intelligence/production/queue");
    return res.json({ success: true, data: prod.getProductionQueue() });
  } catch (_e) {
    return res.status(500).json({ success: false, error: "queue_failed" });
  }
});

router.get("/api/intelligence/production/late", (req, res) => {
  try {
    audit(req, "/api/intelligence/production/late");
    return res.json({ success: true, data: prod.getLateJobs() });
  } catch (_e) {
    return res.status(500).json({ success: false, error: "late_failed" });
  }
});

router.get("/api/intelligence/production/waiting-on-deposit", async (req, res) => {
  try {
    audit(req, "/api/intelligence/production/waiting-on-deposit");
    const data = await prod.getWaitingOnDeposit();
    return res.json({ success: true, data });
  } catch (_e) {
    return res.status(500).json({ success: false, error: "deposit_proxy_failed" });
  }
});

router.get("/api/intelligence/production/missing-art", (req, res) => {
  try {
    audit(req, "/api/intelligence/production/missing-art");
    return res.json({ success: true, data: prod.getMissingArt() });
  } catch (_e) {
    return res.status(500).json({ success: false, error: "art_failed" });
  }
});

router.get("/api/intelligence/production/missing-blanks", async (req, res) => {
  try {
    audit(req, "/api/intelligence/production/missing-blanks");
    const lim = Number(req.query.limit) || 50;
    const data = await prod.getMissingBlanks(lim);
    return res.json({ success: true, data });
  } catch (_e) {
    return res.status(500).json({ success: false, error: "blanks_failed" });
  }
});

router.get("/api/intelligence/production/today", async (req, res) => {
  try {
    audit(req, "/api/intelligence/production/today");
    const lim = Number(req.query.limit) || 40;
    const data = await prod.getTodaysPriorityList(lim);
    return res.json({ success: true, data });
  } catch (_e) {
    return res.status(500).json({ success: false, error: "today_failed" });
  }
});

module.exports = router;
