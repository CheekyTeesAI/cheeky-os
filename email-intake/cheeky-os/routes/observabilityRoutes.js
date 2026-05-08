"use strict";

const express = require("express");

const traceEngine = require("../diagnostics/traceEngine");
const metricsCollector = require("../diagnostics/metricsCollector");
const operatorReadinessCheck = require("../operator/operatorReadinessCheck");

const router = express.Router();

function correlationId(req) {
  try {
    const h =
      (req.headers &&
        (req.headers["x-correlation-id"] || req.headers["x-correlationid"] || req.headers["x-request-id"])) ||
      "";
    return String(h).trim().slice(0, 120) || null;
  } catch (_e) {
    return null;
  }
}

router.use((req, res, next) => {
  const t0 = Date.now();
  const startedAt = new Date().toISOString();
  const corr = correlationId(req);
  const pathStr = String(req.originalUrl || req.url || "").slice(0, 500);
  try {
    metricsCollector.bumpRequest(Date.now());
  } catch (_b) {}
  res.on("finish", () => {
    try {
      const dur = Math.max(0, Date.now() - t0);
      const success = res.statusCode < 400;
      traceEngine.recordTrace({
        traceId: traceEngine.newId("http"),
        correlationId: corr,
        requestPath: pathStr,
        method: req.method,
        httpStatus: res.statusCode,
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: dur,
        success,
        error: success ? null : `http_${res.statusCode}`,
      });
      if (!success) metricsCollector.bumpFailure(Date.now());
    } catch (_e) {}
  });
  next();
});

router.get("/api/observability/traces", (req, res) => {
  try {
    const lim = Math.min(400, Math.max(10, Number(req.query.limit) || 80));
    const rows = traceEngine.tailTraces(lim);
    return res.json({ success: true, data: { traces: rows, count: rows.length } });
  } catch (_e) {
    return res.status(500).json({ success: false, error: "traces_failed" });
  }
});

router.get("/api/observability/metrics", (_req, res) => {
  try {
    const roll = metricsCollector.rollup();
    return res.json({ success: true, data: roll });
  } catch (_e) {
    return res.status(500).json({ success: false, error: "metrics_failed" });
  }
});

router.get("/api/observability/latency", (_req, res) => {
  try {
    const doc = metricsCollector.safeLoad();
    return res.json({
      success: true,
      data: { connectorLatency: doc.connectorLatency || {}, rollup: metricsCollector.rollup().connectorLatency },
    });
  } catch (_e) {
    return res.status(500).json({ success: false, error: "latency_failed" });
  }
});

router.get("/api/observability/failures", (req, res) => {
  try {
    const lim = Math.min(400, Math.max(10, Number(req.query.limit) || 100));
    const rows = traceEngine.tailTraces(Math.min(800, lim * 4)).filter((r) => r && r.success === false);
    return res.json({
      success: true,
      data: { failures: rows.slice(-lim), count: Math.min(rows.length, lim) },
    });
  } catch (_e) {
    return res.status(500).json({ success: false, error: "failures_failed" });
  }
});

router.get("/api/observability/readiness", (_req, res) => {
  try {
    const payload = operatorReadinessCheck.runActivationReadiness();
    return res.json({ success: true, data: payload });
  } catch (_e) {
    return res.status(500).json({ success: false, error: "readiness_failed" });
  }
});

module.exports = router;
