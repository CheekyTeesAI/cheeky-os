"use strict";

const express = require("express");
const { runDecisionEngine } = require("../services/decisionEngine");
const { executeDecisions } = require("../services/decisionExecutor");
const { getDecisionSnapshot } = require("../services/decisionSnapshot");
const { getDecisionMode } = require("../services/decisionPolicy");

const router = express.Router();

router.get("/api/decision/health", async (_req, res) => {
  try {
    return res.json({
      ok: String(process.env.DECISION_ENGINE_ENABLED || "true").toLowerCase() === "true",
      service: "decision-engine",
      mode: getDecisionMode(),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return res.json({
      ok: false,
      service: "decision-engine",
      mode: "recommend_only",
      error: err && err.message ? err.message : String(err),
      timestamp: new Date().toISOString(),
    });
  }
});

router.get("/api/decision/snapshot", async (_req, res) => {
  try {
    return res.json(await getDecisionSnapshot());
  } catch (err) {
    return res.json({
      mode: getDecisionMode(),
      totalRecommendations: 0,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      topActions: [],
      blockedActions: [],
      error: err && err.message ? err.message : String(err),
      timestamp: new Date().toISOString(),
    });
  }
});

router.get("/api/decision/top", async (_req, res) => {
  try {
    const snap = await getDecisionSnapshot();
    return res.json({
      mode: snap.mode,
      totalRecommendations: snap.totalRecommendations,
      topActions: (snap.topActions || []).slice(0, 5),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return res.json({
      mode: getDecisionMode(),
      totalRecommendations: 0,
      topActions: [],
      error: err && err.message ? err.message : String(err),
      timestamp: new Date().toISOString(),
    });
  }
});

router.post("/api/decision/run", async (_req, res) => {
  try {
    if (String(process.env.DECISION_ENGINE_ENABLED || "true").toLowerCase() !== "true") {
      return res.json({
        success: false,
        mode: getDecisionMode(),
        generated: 0,
        executed: 0,
        blocked: 0,
        topActions: [],
        message: "Decision engine disabled",
        timestamp: new Date().toISOString(),
      });
    }

    const mode = getDecisionMode();
    const generated = await runDecisionEngine();
    const decisions = generated && generated.success ? generated.decisions : [];
    let finalDecisions = decisions;
    if (mode === "controlled_internal_actions") {
      finalDecisions = await executeDecisions(decisions);
    }
    return res.json({
      success: true,
      mode,
      generated: decisions.length,
      executed: finalDecisions.filter((d) => d.outcome === "executed").length,
      blocked: finalDecisions.filter((d) => d.outcome === "blocked").length,
      topActions: finalDecisions.slice(0, 5),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return res.json({
      success: false,
      mode: getDecisionMode(),
      generated: 0,
      executed: 0,
      blocked: 0,
      topActions: [],
      error: err && err.message ? err.message : String(err),
      timestamp: new Date().toISOString(),
    });
  }
});

router.get("/api/decision/explain/:entityId", async (req, res) => {
  try {
    const entityId = String(req.params.entityId || "");
    const generated = await runDecisionEngine();
    const decisions = generated && generated.success ? generated.decisions : [];
    const matches = decisions.filter((d) => d.entityId === entityId);
    const matchedRules = matches.map((m) => m.decisionType);
    return res.json({
      entityId,
      matchedRules,
      recommendations: matches.filter((m) => m.outcome === "recommended" || m.outcome === "executed"),
      blockedActions: matches.filter((m) => m.outcome === "blocked"),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return res.json({
      entityId: String(req.params.entityId || ""),
      matchedRules: [],
      recommendations: [],
      blockedActions: [],
      note: "No explainability data available for this entity.",
      error: err && err.message ? err.message : String(err),
      timestamp: new Date().toISOString(),
    });
  }
});

module.exports = router;
