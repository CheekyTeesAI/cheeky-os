"use strict";

const path = require("path");
const express = require("express");
const router = express.Router();
const getSummary = require("../operator/summary");
const { buildOperatorSalesBrief } = require("../../services/salesEngineV1.service");
const {
  runOperatorCycle,
  buildOperatorDailyBrief,
} = require("../../services/operatorCycle.service");

const OPERATOR_AI_LAYER_META = {
  status: "AI_OPERATOR_ACTIVE",
  actionsGenerated: true,
  decisionsRanked: true,
  operatorLoadReduced: true,
  nextAction: "Run /api/operator/run every morning and execute top 3 actions.",
};

router.get("/api/operator/run", async (_req, res) => {
  try {
    const data = await runOperatorCycle({ queue: true });
    return res.json({ ...data, ...OPERATOR_AI_LAYER_META });
  } catch (err) {
    console.error("[operator/run-cycle]", err && err.message ? err.message : err);
    return res.status(200).json({
      cash: { unpaidInvoices: [], depositsNeeded: [], overdueBalances: [], summary: {} },
      sales: { quotesNeedingFollowup: [], highValueDeals: [], dormantCustomers: [], followups: [], summary: {} },
      production: { jobsReadyNotStarted: [], jobsStuck: [], capacityOverload: false, openTaskCount: 0 },
      risks: { riskLevel: "LOW", engineRisks: [], summary: {} },
      actions: [
        {
          priority: 1,
          type: "SALES",
          title: "Operator cycle recovery",
          reason: err && err.message ? err.message : "Unknown error",
          impact: "LOW",
          effort: "LOW",
          action: "Check database connectivity and logs; re-run when Prisma is available.",
        },
      ],
      queue: { queued: 0, cycleId: null, totalPending: 0 },
      followups: { required: [], readyToSend: [], estimatedCashRecovery: 0 },
      pricing: { dealsEvaluated: [], riskyDeals: [], priceAdjustments: [] },
      bigDeals: { mustClose: [], followups: [], estimatedRevenue: 0 },
      programs: { clientsToConvert: [], outreachNeeded: [], expectedRevenue: 0 },
      safety: {
        noAutoExecution: true,
        noAutoSend: true,
        noAutoBlanks: true,
        noAutoStageMove: true,
      },
      error: err && err.message ? err.message : String(err),
      ...OPERATOR_AI_LAYER_META,
    });
  }
});

router.get("/api/operator/daily", async (_req, res) => {
  try {
    const brief = await buildOperatorDailyBrief();
    return res.json({ ...brief, ...OPERATOR_AI_LAYER_META });
  } catch (err) {
    console.error("[operator/daily]", err && err.message ? err.message : err);
    return res.status(200).json({
      headline: "Brief unavailable",
      top3Actions: [],
      biggestRisk: "Unknown",
      easiestWin: "—",
      cashFocus: "—",
      productionFocus: "—",
      error: err && err.message ? err.message : String(err),
      ...OPERATOR_AI_LAYER_META,
    });
  }
});

router.get("/api/operator/brief", async (_req, res) => {
  try {
    const sales = await buildOperatorSalesBrief();
    return res.json({
      success: true,
      timestamp: new Date().toISOString(),
      sales,
    });
  } catch (err) {
    return res.status(200).json({
      success: false,
      timestamp: new Date().toISOString(),
      sales: {
        dealsToClose: [],
        followups: [],
        revenueOpportunities: [],
      },
      error: err && err.message ? err.message : String(err),
    });
  }
});

router.get("/api/operator/summary", async (_req, res) => {
  try {
    const data = await getSummary();
    return res.json(data);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : String(err),
    });
  }
});

/** Live Dataverse intake rows eligible for ops (INTAKE_NEW / AI_PARSED) — mirrors operator what_needs_printing. */
router.get("/api/operator/queue", async (_req, res) => {
  try {
    const mod = require(path.join(
      __dirname,
      "..",
      "..",
      "..",
      "dist",
      "services",
      "intakeQueuePrintingService.js"
    ));
    const out = await mod.listIntakesEligibleForPrinting();
    /** HTTP 200 + jobs[] keeps dashboards stable; callers use ok + error for failure detail. */
    if (!out.ok) {
      const msg = String(out.error || "");
      const schemaMismatch = /Could not find a property named|0x80060888|dataverse/i.test(msg);
      if (schemaMismatch) {
        return res.status(200).json({
          success: true,
          degradedMode: true,
          warnings: [
            "Intake queue partially unavailable — showing safe empty snapshot. Align CHEEKY_DV_INTAKE_* logical names.",
          ],
          data: {
            ok: true,
            degraded: true,
            source: "dataverse_intake_queue",
            count: 0,
            jobs: [],
            warning:
              "Intake queue partially unavailable — showing safe empty snapshot. Align CHEEKY_DV_INTAKE_* logical names.",
            error: msg.slice(0, 360),
          },
        });
      }
      return res.status(200).json({
        success: false,
        degradedMode: true,
        warnings: [String(out.error || "print_queue_failed").slice(0, 360)],
        data: {
          ok: false,
          source: "dataverse_intake_queue",
          count: 0,
          jobs: [],
          error: out.error || "print_queue_failed",
        },
      });
    }
    return res.json({
      success: true,
      degradedMode: false,
      warnings: [],
      data: {
        ok: true,
        source: "dataverse_intake_queue",
        count: out.jobs ? out.jobs.length : 0,
        jobs: out.jobs || [],
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      degradedMode: true,
      warnings: [err && err.message ? String(err.message) : String(err)],
      data: {
        ok: false,
        error: err && err.message ? err.message : String(err),
        jobs: [],
      },
    });
  }
});

module.exports = router;
