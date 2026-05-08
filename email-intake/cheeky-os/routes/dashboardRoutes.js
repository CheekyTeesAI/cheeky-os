"use strict";

const express = require("express");
const crypto = require("crypto");

const { transportAuth } = require("../bridge/transportAuth");
const { buildOperationalSnapshot } = require("../dashboard/dashboardAggregator");

const router = express.Router();

function optionalTransport(req, res, next) {
  const expected = String(process.env.CHEEKY_TRANSPORT_KEY || "").trim();
  if (!expected) return next();
  return transportAuth(req, res, next);
}

function correlationId() {
  try {
    return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `corr-${Date.now()}`;
  } catch (_e) {
    return `corr-${Date.now()}`;
  }
}

router.get("/overview", optionalTransport, (req, res) => {
  const cid = correlationId();
  try {
    const overview = buildOperationalSnapshot();
    try {
      const osm = require("../memory/operatorSessionMemory");
      osm.rememberInteraction("dashboard_overview", { at: overview.generatedAt });
    } catch (_m) {}
    return res.json({ success: true, data: overview, correlationId: cid });
  } catch (e) {
    return res.status(500).json({
      success: false,
      error: "dashboard_overview_failed",
      correlationId: cid,
      message: e && e.message ? e.message : String(e),
    });
  }
});

router.get("/alerts", optionalTransport, (req, res) => {
  const cid = correlationId();
  try {
    const overview = buildOperationalSnapshot();
    return res.json({
      success: true,
      data: { alerts: overview.alerts || [], generatedAt: overview.generatedAt },
      correlationId: cid,
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: "dashboard_alerts_failed", correlationId: cid });
  }
});

router.get("/recommendations", optionalTransport, (req, res) => {
  const cid = correlationId();
  try {
    const { generateRecommendations } = require("../intelligence/recommendationEngine");
    const recs = generateRecommendations();
    return res.json({
      success: true,
      data: { recommendations: recs, count: recs.length },
      correlationId: cid,
    });
  } catch (e) {
    return res.status(500).json({
      success: false,
      error: "dashboard_recommendations_failed",
      correlationId: cid,
      message: e && e.message ? e.message : String(e),
    });
  }
});

router.get("/health", optionalTransport, (_req, res) => {
  const cid = correlationId();
  try {
    const { summarizeHealth } = require("../diagnostics/systemHealthEngine");
    const h = summarizeHealth();
    return res.json({
      success: true,
      data: {
        dashboardApi: "ok",
        grade: h.overallGrade,
        generatedAt: h.generatedAt,
        checksPassed: Array.isArray(h.checks) ? h.checks.filter((c) => c.status === "ok").length : 0,
      },
      correlationId: cid,
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: "dashboard_health_failed", correlationId: cid });
  }
});

module.exports = router;
