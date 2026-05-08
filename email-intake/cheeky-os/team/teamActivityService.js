"use strict";

const approvalGateService = require("../approvals/approvalGateService");
const frictionLogService = require("../ops/frictionLogService");
const workflowOrderDraft = require("../drafting/workOrderDraftService");
const garmentOrderDraft = require("../drafting/garmentOrderDraftService");
const followUpDraft = require("../drafting/followUpDraftService");
const outreachDraftService = require("../growth/outreachDraftService");

/**
 * Lightweight composite activity timeline — no authentication/roles baked in yet.
 */

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function listActivities(limitRaw) {
  const limit = Math.min(200, Math.max(15, Number(limitRaw) || 80));

  /** @type {object[]} */
  const acts = [];

  try {
    approvalGateService.getApprovalHistory(260).forEach((a) => {
      if (!a) return;
      acts.push({
        id: makeId("ap"),
        actor: String(a.resolvedBy || "system"),
        activityType: "approval_resolution",
        description: `${String(a.status || "").toUpperCase()} · ${a.actionType || ""} (${String(a.customer || "").slice(0, 90)})`,
        relatedEntity: a.id ? `approval:${a.id}` : "approval:hidden",
        timestamp: a.resolvedAt || a.createdAt || new Date().toISOString(),
      });
    });
  } catch (_e) {}

  try {
    frictionLogService.tailRecent(120).forEach((f, idx) => {
      if (!f) return;
      acts.push({
        id: makeId("fr"),
        actor: String(f.whoNoticed || "operator"),
        activityType: "friction_log",
        description: `${f.area || "area"} — ${String(f.description || "").slice(0, 220)}`,
        relatedEntity: `friction:${idx}`,
        timestamp: f.createdAt || new Date().toISOString(),
      });
    });
  } catch (_e2) {}

  try {
    workflowOrderDraft.listPendingWorkOrderDrafts().slice(0, 10).forEach((d) =>
      acts.push({
        id: makeId("wo"),
        actor: "drafting",
        activityType: "draft_pending",
        description: `Work order draft pending · ${String(d.orderId || d.id || "").slice(0, 80)}`,
        relatedEntity: d.id ? `wo:${d.id}` : "",
        timestamp: new Date().toISOString(),
      })
    );
  } catch (_e3) {}

  try {
    garmentOrderDraft.listPendingGarmentDrafts().slice(0, 10).forEach((d) =>
      acts.push({
        id: makeId("gm"),
        actor: "drafting",
        activityType: "draft_pending",
        description: `Garment draft pending · ${String(d.orderId || d.id || "").slice(0, 80)}`,
        relatedEntity: d.id ? `garment:${d.id}` : "",
        timestamp: new Date().toISOString(),
      })
    );
  } catch (_e4) {}

  try {
    followUpDraft.listPendingFollowUpDrafts().slice(0, 10).forEach((d) =>
      acts.push({
        id: makeId("fu"),
        actor: "drafting",
        activityType: "draft_pending",
        description: `Customer follow-up draft · ${String(d.orderId || d.id || "").slice(0, 80)}`,
        relatedEntity: d.id ? `followup:${d.id}` : "",
        timestamp: new Date().toISOString(),
      })
    );
  } catch (_e5) {}

  try {
    (outreachDraftService.listOutreachDrafts ? outreachDraftService.listOutreachDrafts() : []).slice(0, 12).forEach((d) =>
      acts.push({
        id: makeId("ogr"),
        actor: "growth",
        activityType: "outreach_sequence",
        description: `Outreach (${d.outreachType || "type"}) · ${String(d.customer || "").slice(0, 90)}`,
        relatedEntity: d.id ? `outreach:${d.id}` : "",
        timestamp: d.createdAt ? String(d.createdAt).slice(0, 36) : new Date().toISOString(),
      })
    );
  } catch (_e6) {}

  acts.sort(function (a, b) {
    return String(b.timestamp).localeCompare(String(a.timestamp));
  });

  return {
    items: acts.slice(0, limit),
    generatedAt: new Date().toISOString(),
    jeremyChecklist: [
      "Reload cockpit + confirm blocker lane zero for cash holds before lunch.",
      "Clear READY FOR JEREMY cards first — escalate apparel stalls to Patrick explicitly.",
      "Log friction if any Square cache feels stale.",
    ],
    patrickReviewChecklist: [
      "Clear approval gate before approving outreach drafts manually.",
      "Pair KPI anomalies with nightly growth review bullets.",
      "Scan Google Ads flagged rows tonight—no autopilot tweaks.",
    ],
    shiftNotes: [
      "Shift notes still live inside friction logs + playbook — no separate auth vault yet.",
    ],
    guardrailEcho: "Read-only telemetry — escalate money moves through approvals + verified Square truths.",
  };
}

module.exports = {
  listActivities,
};
