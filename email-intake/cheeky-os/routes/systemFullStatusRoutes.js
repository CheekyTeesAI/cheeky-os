"use strict";

const express = require("express");

const fullSystemStatusService = require("../monitoring/fullSystemStatusService");
const { safeFailureResponse } = require("../utils/safeFailureResponse");

const router = express.Router();

router.get("/full-status", async (_req, res) => {
  try {
    const data = await fullSystemStatusService.buildFullSystemStatus();
    return res.status(200).json(data);
  } catch (_e) {
    return res.status(200).json(
      Object.assign(
        {
          success: true,
          generatedAt: new Date().toISOString(),
          boot: {
            status: "degraded",
            allowPartialBoot: String(process.env.CHEEKY_OS_ALLOW_PARTIAL_BOOT || "").toLowerCase() === "true",
            intakeSelfTestEnabled: String(process.env.CHEEKY_OS_BOOT_INTAKE_SELFTEST || "").toLowerCase() === "true",
            strictSchemaCheck: String(process.env.CHEEKY_OS_STRICT_SCHEMA_CHECK || "").toLowerCase() === "true",
          },
          schema: { status: "warnings", warnings: ["Full status assembly deferred."] },
          services: {
            dashboard: "ok",
            intakeQueue: "degraded",
            prisma: "degraded",
            dataverse: "degraded",
            squareApi: "degraded",
            localFallbackStorage: "degraded",
          },
          schemaWarnings: ["Full status assembly deferred."],
          degradedMode: true,
          nextRecommendedAction: "Check Dataverse schema alignment",
        },
        safeFailureResponse({ safeMessage: "Boot completed with warnings. Full data pending schema alignment.", technicalCode: "full_status_fail", fallbackUsed: true, degradedMode: true })
      )
    );
  }
});

router.get("/full-health-check", async (_req, res) => {
  try {
    const data = await fullSystemStatusService.buildFullSystemStatus();
    const checks = {
      blockersSurface: data && data.dashboardStatus ? "ok" : "insufficient_data",
      approvalsSurface:
        data && data.approvalsStatus && data.approvalsStatus.pending !== undefined ? "ok" : "unknown",
      backupSurface:
        data && data.backupStatus && data.backupStatus.lastSnapshotFilename !== undefined ? "ok" : "unknown",
      warningsCount: Array.isArray(data.warnings) ? data.warnings.length : "unknown",
    };
    return res.json({
      success: true,
      data: {
        overallHealth: data.overallHealth || "unknown",
        healthScore: data.healthScore != null ? data.healthScore : "unknown",
        checks,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (_e2) {
    return res.status(200).json(
      Object.assign(
        safeFailureResponse({
          safeMessage: "Full health check paused safely.",
          technicalCode: "full_health_check_fail",
          fallbackUsed: true,
        }),
        {
          data: {
            overallHealth: "unknown",
            healthScore: "unknown",
            checks: {
              blockersSurface: "unknown",
              approvalsSurface: "unknown",
              backupSurface: "unknown",
              warningsCount: "unknown",
            },
            generatedAt: new Date().toISOString(),
          },
        }
      )
    );
  }
});

module.exports = router;
