"use strict";

const express = require("express");

const safety = require("../agent/safetyGuard");
const dashboardDataService = require("../dashboard/dashboardDataService");
const { runDashboardReadiness } = require("../dashboard/dashboardReadinessCheck");
const { safeFailureResponse } = require("../utils/safeFailureResponse");
const dashboardSummaryService = require("../services/dashboardSummaryService");

const router = express.Router();

router.use((req, res, next) => {
  try {
    safety.auditLog({
      eventType: "operator_dashboard_v8",
      taskId: null,
      actor: "http",
      metadata: {
        route: req.path,
        readOnly: true,
      },
    });
  } catch (_e) {}
  next();
});

router.get("/api/dashboard/main", async (_req, res) => {
  try {
    const d = await dashboardDataService.buildMainDashboard();
    return res.status(200).json({
      success: true,
      degradedMode: false,
      safeMessage: "",
      generatedAt: new Date().toISOString(),
      cachedAt: null,
      warnings: [],
      data: d,
    });
  } catch (e) {
    /** Never return blank dashboard — degraded payload with mocks */
    try {
      const mock = require("../dashboard/mockDashboardData");
      return res.status(200).json({
        success: true,
        degradedMode: true,
        safeMessage: "Dashboard is online. Some data may be incomplete.",
        generatedAt: new Date().toISOString(),
        cachedAt: null,
        warnings: [],
        data: {
          degraded: true,
          errorHint: e.message || String(e),
          todaysFocus: mock.mockTodaysFocus(),
          normalizedSections: mock.mockNormalizedSections(),
          rulesVersion: "v8.1-degraded",
        },
      });
    } catch (_e2) {
      return res.status(200).json(
        Object.assign(
          {
            success: true,
            degradedMode: true,
            safeMessage: "Dashboard is online. Some data may be incomplete.",
            generatedAt: new Date().toISOString(),
            cachedAt: null,
            warnings: [],
            data: { degraded: true, todaysFocus: {}, normalizedSections: {} },
          },
          safeFailureResponse({ technicalCode: "dashboard_main_failed", degradedMode: true })
        )
      );
    }
  }
});

router.get("/api/dashboard/summary", async (_req, res) => {
  try {
    const s = await dashboardSummaryService.buildDashboardSummary();
    return res.status(200).json(s);
  } catch (e) {
    console.warn("[DASHBOARD][WARN] /api/dashboard/summary:", e && e.message ? e.message : String(e));
    const flat = dashboardSummaryService.ensureFlatSummaryData(null);
    flat.staleSources = ["summary_route_failed"];
    flat.warnings = ["summary_route_failed"];
    return res.status(200).json({
      success: true,
      degradedMode: true,
      safeMessage: "Dashboard is online. Some data may be incomplete.",
      generatedAt: new Date().toISOString(),
      cachedAt: null,
      data: flat,
    });
  }
});

router.get("/api/dashboard/readiness", (_req, res) => {
  try {
    const data = runDashboardReadiness();
    return res.status(200).json({
      success: true,
      degradedMode: false,
      safeMessage: "",
      generatedAt: new Date().toISOString(),
      cachedAt: null,
      data,
    });
  } catch (e) {
    return res.status(200).json(
      Object.assign(
        {
          success: true,
          degradedMode: true,
          safeMessage: "Dashboard readiness degraded.",
          generatedAt: new Date().toISOString(),
          cachedAt: null,
          data: {},
        },
        safeFailureResponse({ technicalCode: "dashboard_readiness_failed", degradedMode: true })
      )
    );
  }
});

router.get("/api/dashboard/production", async (_req, res) => {
  try {
    const d = await dashboardDataService.buildProductionBoardBuckets();
    return res.status(200).json({
      success: true,
      degradedMode: false,
      safeMessage: "",
      generatedAt: new Date().toISOString(),
      cachedAt: null,
      warnings: [],
      data: d,
    });
  } catch (e) {
    console.warn("[ENDPOINT WARNING]", "/api/dashboard/production", e && e.message ? e.message : String(e));
    return res.status(200).json(
      Object.assign(
        {
          success: true,
          degradedMode: true,
          safeMessage: "Dashboard is online. Some data may be incomplete.",
          generatedAt: new Date().toISOString(),
          cachedAt: null,
          warnings: [],
          data: {
            generatedAt: new Date().toISOString(),
            columns: {
              approvedForProduction: [],
              garmentsNeeded: [],
              garmentsOrdered: [],
              productionReady: [],
              inProduction: [],
              qc: [],
              readyForPickup: [],
            },
          },
        },
        safeFailureResponse({
          safeMessage: "Dashboard is online. Some data may be incomplete.",
          technicalCode: "HANDLER_ERROR",
          degradedMode: true,
        })
      )
    );
  }
});

router.get("/api/dashboard/intake", async (_req, res) => {
  try {
    const d = await dashboardDataService.buildIntakePipeline();
    return res.status(200).json({
      success: true,
      degradedMode: false,
      safeMessage: "",
      generatedAt: new Date().toISOString(),
      cachedAt: null,
      data: d,
    });
  } catch (e) {
    return res.status(200).json(
      Object.assign(
        {
          success: true,
          degradedMode: true,
          safeMessage: "Dashboard is online. Some data may be incomplete.",
          generatedAt: new Date().toISOString(),
          cachedAt: null,
          data: {},
        },
        safeFailureResponse({ technicalCode: "dashboard_intake_failed", degradedMode: true })
      )
    );
  }
});

router.get("/api/dashboard/cash", async (_req, res) => {
  try {
    const d = await dashboardDataService.buildCashRisks();
    return res.status(200).json({
      success: true,
      degradedMode: false,
      safeMessage: "",
      generatedAt: new Date().toISOString(),
      cachedAt: null,
      data: d,
    });
  } catch (e) {
    return res.status(200).json(
      Object.assign(
        {
          success: true,
          degradedMode: true,
          safeMessage: "Dashboard is online. Some data may be incomplete.",
          generatedAt: new Date().toISOString(),
          cachedAt: null,
          data: {},
        },
        safeFailureResponse({ technicalCode: "dashboard_cash_failed", degradedMode: true })
      )
    );
  }
});

router.get("/api/dashboard/art", async (_req, res) => {
  try {
    const d = await dashboardDataService.buildArtPipeline();
    return res.status(200).json({
      success: true,
      degradedMode: false,
      safeMessage: "",
      generatedAt: new Date().toISOString(),
      cachedAt: null,
      data: d,
    });
  } catch (e) {
    return res.status(200).json(
      Object.assign(
        {
          success: true,
          degradedMode: true,
          safeMessage: "Dashboard is online. Some data may be incomplete.",
          generatedAt: new Date().toISOString(),
          cachedAt: null,
          data: {},
        },
        safeFailureResponse({ technicalCode: "dashboard_art_failed", degradedMode: true })
      )
    );
  }
});

router.get("/api/dashboard/garments", async (_req, res) => {
  try {
    const d = await dashboardDataService.buildGarmentBoard();
    return res.status(200).json({
      success: true,
      degradedMode: false,
      safeMessage: "",
      generatedAt: new Date().toISOString(),
      cachedAt: null,
      data: d,
    });
  } catch (e) {
    return res.status(200).json(
      Object.assign(
        {
          success: true,
          degradedMode: true,
          safeMessage: "Dashboard is online. Some data may be incomplete.",
          generatedAt: new Date().toISOString(),
          cachedAt: null,
          data: {},
        },
        safeFailureResponse({ technicalCode: "dashboard_garments_failed", degradedMode: true })
      )
    );
  }
});

module.exports = router;
