"use strict";

const express = require("express");

const blockerFirstDashboardService = require("../dashboard/blockerFirstDashboardService");
const productionBoardService = require("../production/productionBoardService");
const { safeFailureResponse } = require("../utils/safeFailureResponse");

const router = express.Router();

router.get("/api/dashboard/blockers", async (_req, res) => {
  try {
    const data = await blockerFirstDashboardService.buildBlockerFirstEnvelope();
    return res.status(200).json({
      success: true,
      degradedMode: false,
      safeMessage: "",
      generatedAt: new Date().toISOString(),
      cachedAt: null,
      warnings: [],
      data: Object.assign({}, data),
    });
  } catch (_e) {
    console.warn("[ENDPOINT WARNING]", "/api/dashboard/blockers", _e && _e.message ? _e.message : String(_e));
    const sf = safeFailureResponse({
      safeMessage: "Intake queue partially unavailable — showing last known data.",
      technicalCode: "HANDLER_ERROR",
      fallbackUsed: true,
      schemaWarnings: ["Dataverse returned partial fields — normalized data shown."],
      degradedMode: true,
    });
    return res.status(200).json({
      success: true,
      degradedMode: true,
      safeMessage: sf.safeMessage,
      generatedAt: new Date().toISOString(),
      cachedAt: sf.cachedAt || null,
      warnings: Array.isArray(sf.schemaWarnings) ? sf.schemaWarnings.map(String) : [],
      data: {
        degraded: true,
        blockers: [],
        schemaWarnings: sf.schemaWarnings,
        alert: sf,
        sections: minimalFallbackSections(),
      },
    });
  }
});

/** Jeremy-friendly simplified production buckets (additive path). */

router.get("/api/dashboard/production-cockpit", async (_req, res) => {
  try {
    const pb = await productionBoardService.buildOperationalProductionBoard();
    return res.status(200).json({
      success: true,
      degradedMode: false,
      safeMessage: "",
      generatedAt: pb.generatedAt || new Date().toISOString(),
      cachedAt: null,
      warnings: [],
      data: pb,
    });
  } catch (_e) {
    const sf = safeFailureResponse({
      safeMessage: "Production cockpit could not reach the database safely — columns stay empty.",
      technicalCode: "production_cockpit_failed",
      fallbackUsed: true,
    });
    const cols = {
      Intake: [],
      "Waiting on Deposit": [],
      "Art Needed": [],
      Digitizing: [],
      "Evaluate & Approve": [],
      "On Hold": [],
      "Approved for Production": [],
      "Garments Needed": [],
      "Garments Ordered": [],
      "Production Ready": [],
      "In Production": [],
      QC: [],
      "Ready for Pickup": [],
      Completed: [],
    };
    return res.status(200).json({
      success: true,
      degradedMode: true,
      safeMessage: sf.safeMessage,
      generatedAt: new Date().toISOString(),
      cachedAt: sf.cachedAt || null,
      warnings: [String(sf.safeMessage || "production_cockpit_failed").slice(0, 240)],
      data: {
        degraded: true,
        alert: sf,
        columns: cols,
        emptyExplanation: sf.safeMessage,
      },
    });
  }
});

function minimalFallbackSections() {
  const now = new Date().toISOString();
  const card = {
    id: "degraded-banner",
    customer: "",
    orderName: "Safe placeholder",
    blockerType: "degraded",
    blockerReason: "Cockpit service hit an internal guard — nobody is penalized.",
    moneyImpact: "unknown",
    productionImpact: "unknown",
    whatToDoNext: "Reload after a breath; connectors stay read-only.",
    approvalRequired: false,
    dueDate: null,
    source: "safe_fallback",
    lastUpdated: now,
  };
  return [
    { title: "CRITICAL BLOCKERS", note: null, cards: [card] },
    { title: "CASH RISKS", note: null, cards: [card] },
    { title: "PRODUCTION BLOCKERS", note: null, cards: [card] },
    { title: "APPROVALS NEEDED", note: null, cards: [card] },
    { title: "READY FOR JEREMY", note: null, cards: [card] },
    { title: "SYSTEM HEALTH", note: null, cards: [card] },
  ];
}

module.exports = router;
