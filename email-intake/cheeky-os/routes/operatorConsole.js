"use strict";

const express = require("express");
const crypto = require("crypto");

const { transportAuth } = require("../bridge/transportAuth");
const nle = require("../operator/naturalLanguageEngine");
const execOrch = require("../execution/liveExecutionOrchestrator");
const { computeOperationalPriorities } = require("../intelligence/priorityEngine");
const { generateRecommendations } = require("../intelligence/recommendationEngine");
const { buildOperationalSnapshot } = require("../dashboard/dashboardAggregator");
const oce = require("../memory/operationalContinuityEngine");
const incidents = require("../diagnostics/incidentTracker");

const router = express.Router();
router.use(express.json({ limit: "128kb" }));

function optionalTransport(req, res, next) {
  try {
    const expected = String(process.env.CHEEKY_TRANSPORT_KEY || "").trim();
    if (!expected) return next();
    return transportAuth(req, res, next);
  } catch (_e) {
    return res.status(503).json({ success: false, error: "transport_guard_error" });
  }
}

function cid() {
  try {
    return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `corr-${Date.now()}`;
  } catch (_e) {
    return `corr-${Date.now()}`;
  }
}

function actorFrom(req) {
  try {
    const h = req.headers && req.headers["x-actor"];
    if (h) return String(h).trim().slice(0, 160);
    if (req.body && req.body.actor) return String(req.body.actor).trim().slice(0, 160);
    return "operator_jarvis";
  } catch (_e) {
    return "operator_jarvis";
  }
}

/**
 * POST /api/operator/ask
 */
router.post("/ask", optionalTransport, (req, res) => {
  const id = cid();
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const q = String(body.query || body.text || body.message || "").trim();
    if (!q || q.length > 8000) {
      return res.status(400).json({ success: false, error: "query_required", correlationId: id });
    }
    const out = nle.processNaturalLanguage(q, {
      normalizeVoice: body.voiceMode === true,
      includeMemory: body.includeMemory !== false,
    });
    try {
      const tl = require("../diagnostics/executionTimeline");
      tl.appendTimelineEvent({ phase: "jarvis_ask", correlationId: id, intent: out.intent });
    } catch (_tl) {}
    return res.json({ success: true, data: out, correlationId: id });
  } catch (e) {
    return res.status(500).json({
      success: false,
      error: "ask_failed",
      correlationId: id,
      message: e && e.message ? e.message : String(e),
    });
  }
});

/**
 * POST /api/operator/execute — enqueue or run approved tasks only (fail closed).
 */
router.post("/execute", optionalTransport, async (req, res) => {
  const id = cid();
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const mode = String(body.mode || "enqueue").toLowerCase();
    const spec = body.taskSpec && typeof body.taskSpec === "object" ? body.taskSpec : {};
    const actor = actorFrom(req);

    const result = await execOrch.orchestrateExecution({
      mode,
      taskSpec: spec,
      actor,
    });

    if (!result.ok) {
      const code = result.error === "read_only_no_execution" ? 400 : 403;
      return res.status(code).json({ success: false, data: result, correlationId: id });
    }
    return res.json({ success: true, data: result, correlationId: id });
  } catch (e) {
    return res.status(500).json({
      success: false,
      error: "execute_failed",
      correlationId: id,
      message: e && e.message ? e.message : String(e),
    });
  }
});

function jarvisContextPayload() {
  try {
    return {
      operationalSnapshot: buildOperationalSnapshot(),
      continuity: oce.getContinuitySnapshot(),
      priorities: computeOperationalPriorities(12),
      incidentsRecent: incidents.tailIncidents(12),
      note: "GET /api/operator/context is served by Operator Bridge v1. This is the Jarvis v6 operational merge.",
    };
  } catch (_e) {
    return { error: "context_build_failed" };
  }
}

/** GET /api/operator/jarvis/context — additive; does not replace Bridge /context */
router.get("/jarvis/context", optionalTransport, (req, res) => {
  const id = cid();
  try {
    return res.json({ success: true, data: jarvisContextPayload(), correlationId: id });
  } catch (e) {
    return res.status(500).json({ success: false, error: "context_failed", correlationId: id });
  }
});

/** GET /api/operator/operational-context — additive alias */
router.get("/operational-context", optionalTransport, (req, res) => {
  const id = cid();
  try {
    return res.json({ success: true, data: jarvisContextPayload(), correlationId: id });
  } catch (e) {
    return res.status(500).json({ success: false, error: "operational_context_failed", correlationId: id });
  }
});

/** Alias for ChatGPT clients expecting a versioned path */
router.get("/context/v6", optionalTransport, (req, res) => {
  const id = cid();
  try {
    return res.json({ success: true, data: jarvisContextPayload(), correlationId: id });
  } catch (e) {
    return res.status(500).json({ success: false, error: "context_failed", correlationId: id });
  }
});

router.get("/recommendations", optionalTransport, (req, res) => {
  const id = cid();
  try {
    const recs = generateRecommendations();
    return res.json({ success: true, data: { recommendations: recs, count: recs.length }, correlationId: id });
  } catch (e) {
    return res.status(500).json({ success: false, error: "recommendations_failed", correlationId: id });
  }
});

router.get("/alerts", optionalTransport, (req, res) => {
  const id = cid();
  try {
    const dash = buildOperationalSnapshot();
    return res.json({
      success: true,
      data: { alerts: dash.alerts || [], generatedAt: dash.generatedAt },
      correlationId: id,
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: "alerts_failed", correlationId: id });
  }
});

router.get("/focus", optionalTransport, (req, res) => {
  const id = cid();
  try {
    const pr = computeOperationalPriorities(8);
    const top = pr[0] || null;
    return res.json({ success: true, data: { focus: top, ranked: pr }, correlationId: id });
  } catch (e) {
    return res.status(500).json({ success: false, error: "focus_failed", correlationId: id });
  }
});

module.exports = router;
