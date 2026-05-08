"use strict";

const express = require("express");
const crypto = require("crypto");

const diagnostics = require("../diagnostics/systemHealthEngine");
const { transportAuth } = require("../bridge/transportAuth");

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

router.get("/health", optionalTransport, (_req, res) => {
  const cid = correlationId();
  try {
    const h = diagnostics.summarizeHealth();
    return res.json({
      success: true,
      data: { grade: h.overallGrade, checks: h.checks, generatedAt: h.generatedAt },
      correlationId: cid,
    });
  } catch (e) {
    return res.status(500).json({
      success: false,
      error: "system_health_failed",
      correlationId: cid,
      message: e && e.message ? e.message : String(e),
    });
  }
});

router.get("/diagnostics", optionalTransport, (_req, res) => {
  const cid = correlationId();
  try {
    const d = diagnostics.runDiagnostics();
    return res.json({ success: true, data: d, correlationId: cid });
  } catch (e) {
    return res.status(500).json({ success: false, error: "system_diagnostics_failed", correlationId: cid });
  }
});

router.get("/failures", optionalTransport, (req, res) => {
  const cid = correlationId();
  try {
    const lim = Math.min(200, Math.max(10, Number(req.query.limit) || 40));
    const rows = diagnostics.listRecentFailures(lim);
    return res.json({ success: true, data: { failures: rows, count: rows.length }, correlationId: cid });
  } catch (e) {
    return res.status(500).json({ success: false, error: "system_failures_failed", correlationId: cid });
  }
});

module.exports = router;
