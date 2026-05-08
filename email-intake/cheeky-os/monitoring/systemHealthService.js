"use strict";

/**
 * Read-only consolidated health envelope for cockpit trust checks.
 */

const snapshotCache = require("../cache/squareSnapshotCache");
const approvalGateService = require("../approvals/approvalGateService");
const frictionLogService = require("../ops/frictionLogService");
const draftHelpers = require("../drafting/draftOrderHelpers");
const playbookGenerator = require("../ops/playbookGenerator");
const selfServiceIntakeService = require("../intake/selfServiceIntakeService");
const notificationService = require("../notifications/notificationService");
const workOrderDraftService = require("../drafting/workOrderDraftService");
const garmentOrderDraftService = require("../drafting/garmentOrderDraftService");
const followUpDraftService = require("../drafting/followUpDraftService");

const PHASE5_OPS_GUARDRAIL =
  "You are the Cheeky Tees operational AI co-pilot. Protect cashflow and production; never send communications automatically; " +
  "if confidence is low, say so; generate recommendations only.";

async function buildSystemHealthSummary() {
  const generatedAt = new Date().toISOString();

  /** @type {object} */
  let cachedSquare = {};
  try {
    cachedSquare = snapshotCache.readSnapshotDisk() || {};
  } catch (_e) {
    cachedSquare = {};
  }
  const squareStatus =
    cachedSquare && cachedSquare.data !== undefined ? "cached_snapshot_present" : "no_local_snapshot_cache";

  let prismaProbe = false;
  try {
    const rows = await draftHelpers.loadOrdersForDrafts(2);
    prismaProbe = Array.isArray(rows);
  } catch (_p) {
    prismaProbe = false;
  }

  let approvalsPending = 0;
  try {
    approvalsPending = approvalGateService.getPendingApprovals().length;
  } catch (_a) {
    approvalsPending = -1;
  }

  /** @type {object} */
  let notifBrief = { unreadCount: 0, itemsLen: 0 };
  try {
    const nb = notificationService.listNotifications();
    notifBrief = { unreadCount: nb.unreadCount || 0, itemsLen: nb.items ? nb.items.length : 0 };
  } catch (_n) {}

  const frictionTail = playbookGenerator.detectFrictionHotspots(10);
  const intakePending = selfServiceIntakeService.listPendingIntake(120).length;

  /** @type {string[]} */
  const warnings = [];
  if (!prismaProbe) warnings.push("Prisma order probe failed — operator dashboards might run empty snapshots.");
  if (squareStatus === "no_local_snapshot_cache") warnings.push("Square operational cache empty — reconcile cash cues manually.");

  /** Escalations */
  if (approvalsPending >= 14) warnings.push(`Approval backlog high (${approvalsPending}) — Patrick triage lane before outbound work.`);
  if (notifBrief.unreadCount >= 14) warnings.push("Unread cockpit notifications clustered — skim high severity items between jobs.");
  if (intakePending >= 18) warnings.push("Self-service intake queue long — carve admin time before promising rush dates.");

  const frictionHigh = frictionTail.filter((f) => f.severity === "high").length;
  if (frictionHigh >= 3) warnings.push("Repeated friction hotspots logged — skim jeremy-playbook.md for patterns.");

  const healthScoreRaw =
    (prismaProbe ? 0.34 : 0.12) +
    (squareStatus === "cached_snapshot_present" ? 0.26 : 0.12) -
    Math.min(0.22, approvalsPending >= 12 ? approvalsPending / 320 : approvalsPending >= 8 ? approvalsPending / 480 : 0) -
    (frictionHigh >= 2 ? 0.06 : 0);
  let healthScore = Math.max(0.12, Math.min(0.96, Math.round(healthScoreRaw * 1000) / 1000));

  const operationalConfidence = Math.round((healthScore + (approvalsPending < 30 ? 0.05 : -0.04)) * 1000) / 1000;

  let draftWo = 0;
  let draftGarment = 0;
  let draftFollowUp = 0;
  try {
    draftWo = workOrderDraftService.listPendingWorkOrderDrafts().length;
  } catch (_wd) {}
  try {
    draftGarment = garmentOrderDraftService.listPendingGarmentDrafts().length;
  } catch (_gd) {}
  try {
    draftFollowUp = followUpDraftService.listPendingFollowUpDrafts().length;
  } catch (_fu) {}

  return {
    healthScore,
    operationalConfidence,
    warnings,
    /** customer-safe empty */
    blockers: warnings.slice(0, 24).map((w) => ({ summary: String(w).slice(0, 220), tier: "ops_signal" })),
    connectorStatus: {
      prismaReadable: prismaProbe,
      squareCache: squareStatus,
      cachedSquareAt:
        cachedSquare && cachedSquare.cachedAt
          ? cachedSquare.cachedAt
          : "unknown",
      note: PHASE5_OPS_GUARDRAIL,
    },
    intakeSignals: { pendingSelfServiceReview: intakePending },
    draftBacklogTotals: {
      workOrderDraftsPending: draftWo,
      garmentDraftsPending: draftGarment,
      customerFollowUpDraftsPending: draftFollowUp,
    },
    escalationRecommendations:
      approvalsPending >= 14
        ? ["Clear gated approvals early today — nothing customer-facing leaves Cheeky OS without Patrick."]
        : ["Keep logging friction snapshots — playbook auto-compilation stays enabled."],
    generatedAt,
    guardrailEcho: PHASE5_OPS_GUARDRAIL,
  };
}

module.exports = {
  buildSystemHealthSummary,
  PHASE5_OPS_GUARDRAIL,
};
