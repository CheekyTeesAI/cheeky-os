"use strict";

const crypto = require("crypto");

const approvalGateService = require("../approvals/approvalGateService");
const frictionLogService = require("../ops/frictionLogService");
const systemHealthService = require("./systemHealthService");
const backupService = require("../backup/backupService");
const kpiService = require("../kpi/kpiService");
const googleAdsInsightService = require("../growth/googleAdsInsightService");
const draftHelpers = require("../drafting/draftOrderHelpers");
const workflowOrderDraft = require("../drafting/workOrderDraftService");
const garmentOrderDraft = require("../drafting/garmentOrderDraftService");
const followUpDraft = require("../drafting/followUpDraftService");
const fs = require("fs");
const path = require("path");
const taskQueue = require("../agent/taskQueue");

/**
 * Compose full dashboard operator status envelope (additive).
 *
 * @returns {Promise<object>}
 */
async function buildFullSystemStatus() {
  const generatedAt = new Date().toISOString();
  const schemaWarnings = [];

  /** @type {object} */
  let health = {};
  try {
    health = await systemHealthService.buildSystemHealthSummary();
  } catch (_e) {
    health = { healthScore: 0.2, operationalConfidence: 0.2, warnings: ["Monitoring assembly failed gracefully."] };
  }

  /** @type {object} */
  let backupStatus = {};
  try {
    backupStatus = backupService.getBackupStatus();
  } catch (_e2) {
    backupStatus = { note: "backup_status_unreadable" };
  }

  /** @type {number} */
  let approvalsPendingSafe = null;
  try {
    approvalsPendingSafe = approvalGateService.getPendingApprovals().length;
  } catch (_e3) {
    approvalsPendingSafe = null;
  }

  /** @type {object[]} */
  let ordersProbe = [];
  try {
    ordersProbe = await draftHelpers.loadOrdersForDrafts(3);
  } catch (_e4) {
    schemaWarnings.push("Prisma probe degraded");
    ordersProbe = [];
  }

  const draftCounts = {
    workOrderPending: 0,
    garmentPending: 0,
    followUpPending: 0,
  };
  try {
    draftCounts.workOrderPending = workflowOrderDraft.listPendingWorkOrderDrafts().length;
  } catch (_e5) {}
  try {
    draftCounts.garmentPending = garmentOrderDraft.listPendingGarmentDrafts().length;
  } catch (_e6) {}
  try {
    draftCounts.followUpPending = followUpDraft.listPendingFollowUpDrafts().length;
  } catch (_e7) {}

  let kpiFresh = "unknown";
  try {
    const doc = kpiService.readHistoryEntries();
    const entry = doc[doc.length - 1];
    if (entry && entry.ts) kpiFresh = String(entry.ts).slice(0, 26);
    else if (entry && entry.dayKey) kpiFresh = String(entry.dayKey);
  } catch (_eK) {}

  const adsFresh = googleAdsInsightService.readInsightsSafe().generatedAt || "unknown_import_window";

  let playbookMtimeIso = null;
  try {
    const pbp = path.join(taskQueue.DATA_DIR, "jeremy-playbook.md");
    if (fs.existsSync(pbp)) playbookMtimeIso = fs.statSync(pbp).mtime.toISOString();
  } catch (_eP) {}

  let lastFrictionTs = "";
  try {
    const ft = frictionLogService.tailRecent(1);
    const row = ft[ft.length - 1];
    lastFrictionTs = row && row.createdAt ? String(row.createdAt) : "";
  } catch (_eF) {}

  const score = typeof health.healthScore === "number" ? health.healthScore : 0.25;
  const overallHealth = score >= 0.74 ? "strong" : score >= 0.48 ? "watch" : score >= 0.3 ? "stressed" : "degraded_safe_mode";

  const warnings = ([]).concat(Array.isArray(health.warnings) ? health.warnings : []);
  if (approvalsPendingSafe != null && approvalsPendingSafe > 22) warnings.push("Approvals backlog is tall — skim gate before quoting growth.");
  if (!ordersProbe.length) warnings.push("Prisma order probe empty — KPI + exports may stall.");
  schemaWarnings.push.apply(schemaWarnings, warnings.filter((w) => /schema|Dataverse|Prisma/i.test(String(w))));
  const uniqueSchemaWarnings = Array.from(new Set(schemaWarnings));
  const intakeStatus = String(health && health.intakeSignals && health.intakeSignals.mode || "").toLowerCase() === "degraded"
    ? "degraded"
    : "ok";
  const prismaStatus = ordersProbe.length ? "ok" : "degraded";
  const dataverseStatus = intakeStatus === "ok" ? "ok" : "degraded";
  const squareStatus = health && health.connectorStatus && health.connectorStatus.squareCacheOk === false ? "degraded" : "ok";
  const localFallbackStorage = backupStatus && backupStatus.directory ? "ok" : "degraded";
  const degradedMode = [intakeStatus, prismaStatus, dataverseStatus, squareStatus, localFallbackStorage].includes("degraded");

  /** @type {object} */
  const dashboardStatus = {
    prismaOrderRowsSeen: ordersProbe.length,
    blockerPanelsNote: health.intakeSignals || null,
  };

  return {
    success: true,
    generatedAt,
    boot: {
      status: degradedMode ? "degraded" : "ok",
      allowPartialBoot: String(process.env.CHEEKY_OS_ALLOW_PARTIAL_BOOT || "").toLowerCase() === "true",
      intakeSelfTestEnabled: String(process.env.CHEEKY_OS_BOOT_INTAKE_SELFTEST || "").toLowerCase() === "true",
      strictSchemaCheck: String(process.env.CHEEKY_OS_STRICT_SCHEMA_CHECK || "").toLowerCase() === "true",
    },
    schema: {
      status: uniqueSchemaWarnings.length ? "warnings" : "ok",
      warnings: uniqueSchemaWarnings,
    },
    services: {
      dashboard: "ok",
      intakeQueue: intakeStatus,
      prisma: prismaStatus,
      dataverse: dataverseStatus,
      squareApi: squareStatus,
      localFallbackStorage,
    },
    schemaWarnings: uniqueSchemaWarnings,
    degradedMode,
    nextRecommendedAction: degradedMode ? "Check Dataverse and Prisma schema alignment for full fidelity." : "",
    // existing diagnostics preserved for backward compatibility
    overallHealth,
    healthScore: typeof health.healthScore === "number" ? health.healthScore : "unknown",
    warnings,
    connectorStatus: health.connectorStatus || { prismaReadable: !!ordersProbe.length, squareCache: "unknown" },
    dashboardStatus,
    approvalsStatus: { pending: approvalsPendingSafe == null ? "unknown" : approvalsPendingSafe },
    backupStatus: {
      directory: backupStatus.directory || "unknown",
      lastSnapshotFilename: backupStatus.lastSnapshotFilename || null,
      lastSnapshotAtIso: backupStatus.lastSnapshotAtIso || null,
      approximateSizeBytes: backupStatus.approximateSizeBytes || 0,
      note: backupStatus.note || null,
    },
    draftCountsSummary: draftCounts,
    dataFreshness: {
      googleAdsImportedAtSafe: adsFresh,
      kpiHistoryHint: kpiFresh,
      jeremyPlaybookMtimeIso: playbookMtimeIso || "unknown",
      lastFrictionAtIsoApprox: lastFrictionTs || "none_recent",
      correlationIdSafe: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `cid-${Date.now()}`,
    },
    guardrailEcho: health.guardrailEcho || systemHealthService.PHASE5_OPS_GUARDRAIL,
  };
}

module.exports = {
  buildFullSystemStatus,
};
