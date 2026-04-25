"use strict";

const express = require("express");
const router = express.Router();
const { getCashMode } = require("../services/cashPolicy");
const { getCashSnapshot } = require("../services/cashSnapshot");
const { getUpcomingObligations } = require("../services/obligationsTracker");
const { estimateRunwayDays } = require("../services/runwayEstimator");
const { getCashPriorities } = require("../services/cashPressureEngine");
const { logCashEvent } = require("../services/cashAudit");

let lastRun = null;

router.get("/api/cash/health", async (_req, res) => {
  try {
    return res.json({ success: true, mode: getCashMode(), timestamp: new Date().toISOString() });
  } catch (error) {
    return res.status(200).json({ success: false, error: error.message, mode: "analysis_only", timestamp: new Date().toISOString() });
  }
});

router.get("/api/cash/snapshot", async (_req, res) => {
  try {
    const snapshot = await getCashSnapshot();
    await logCashEvent("SNAPSHOT_GENERATED", { dataQuality: snapshot.dataQuality.score });
    for (const signal of snapshot.dataQuality.missingSignals || []) {
      await logCashEvent("BLOCKER", { signal });
    }
    return res.json({ success: true, snapshot });
  } catch (error) {
    return res.status(200).json({ success: false, snapshot: null, error: error.message });
  }
});

router.get("/api/cash/obligations", async (_req, res) => {
  try {
    const obligations = getUpcomingObligations().sort((a, b) => (a.daysUntilDue ?? 9999) - (b.daysUntilDue ?? 9999));
    return res.json({ success: true, obligations, count: obligations.length });
  } catch (error) {
    return res.status(200).json({ success: false, obligations: [], error: error.message });
  }
});

router.get("/api/cash/runway", async (_req, res) => {
  try {
    const snapshot = await getCashSnapshot();
    const obligations = getUpcomingObligations();
    const runway = estimateRunwayDays(snapshot, obligations);
    await logCashEvent("RUNWAY_CALCULATED", { runwayDays: runway.runwayDays, certainty: runway.certainty, method: runway.method });
    for (const blocker of runway.blockers || []) {
      await logCashEvent("BLOCKER", { blocker });
    }
    return res.json({ success: true, runway });
  } catch (error) {
    return res.status(200).json({ success: false, runway: null, error: error.message });
  }
});

router.get("/api/cash/priorities", async (_req, res) => {
  try {
    const priorities = await getCashPriorities();
    if (priorities[0]) {
      await logCashEvent("PRIORITY_GENERATED", { priority: priorities[0].priority, title: priorities[0].title });
    }
    return res.json({ success: true, priorities, count: priorities.length });
  } catch (error) {
    return res.status(200).json({ success: false, priorities: [], error: error.message });
  }
});

router.post("/api/cash/run", async (_req, res) => {
  try {
    const snapshot = await getCashSnapshot();
    const obligations = getUpcomingObligations();
    const runway = estimateRunwayDays(snapshot, obligations);
    const priorities = await getCashPriorities();
    lastRun = {
      snapshot,
      obligations,
      runway,
      priorities,
      timestamp: new Date().toISOString(),
    };
    await logCashEvent("FULL_RUN", { priorities: priorities.length, blockers: runway.blockers || [] });
    return res.json({ success: true, snapshot, runway, priorities, timestamp: lastRun.timestamp });
  } catch (error) {
    return res.status(200).json({ success: false, error: error.message, timestamp: new Date().toISOString() });
  }
});

router.get("/api/cash/explain", async (req, res) => {
  try {
    const type = String(req.query.type || "runway").toLowerCase();
    const id = req.query.id ? String(req.query.id) : null;

    if (type === "runway") {
      const snapshot = await getCashSnapshot();
      const obligations = getUpcomingObligations();
      const runway = estimateRunwayDays(snapshot, obligations);
      return res.json({
        success: true,
        type: "runway",
        explanation: {
          matchedRules: ["runway_estimation_from_liquidity_and_burn"],
          assumptions: runway.assumptions || [],
          missingData: runway.blockers || [],
          certainty: runway.certainty,
          method: runway.method,
          runwayDays: runway.runwayDays,
          timestamp: new Date().toISOString(),
        },
      });
    }

    if (type === "priority") {
      const priorities = await getCashPriorities();
      const selected = id ? priorities.find((p) => p.id === id) : priorities[0];
      return res.json({
        success: true,
        type: "priority",
        explanation: selected
          ? {
              matchedRules: [`priority_rule_${selected.id}`],
              assumptions: [selected.reason],
              missingData: [],
              certainty: selected.certainty,
              priority: selected.priority,
              title: selected.title,
              timestamp: selected.timestamp,
            }
          : null,
      });
    }

    if (type === "obligation") {
      const obligations = getUpcomingObligations();
      const selected = id ? obligations.find((o) => o.id === id) : obligations[0];
      return res.json({
        success: true,
        type: "obligation",
        explanation: selected
          ? {
              matchedRules: ["obligation_due_date_urgency"],
              assumptions: [selected.notes || "operator-maintained obligation source"],
              missingData: selected.daysUntilDue === null ? ["dueDate"] : [],
              certainty: selected.certainty,
              obligation: selected,
              timestamp: new Date().toISOString(),
            }
          : null,
      });
    }

    return res.json({
      success: true,
      type,
      explanation: {
        matchedRules: [],
        assumptions: [],
        missingData: ["unsupported type"],
        certainty: "unknown",
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return res.status(200).json({ success: false, explanation: null, error: error.message });
  }
});

module.exports = router;
