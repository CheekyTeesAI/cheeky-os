"use strict";

const crypto = require("crypto");

/** @typedef {"cash"|"production"|"approvals"|"tasks"|"sales"|"system"} PriorityCategory */

/**
 * @returns {object[]}
 */
function computeOperationalPriorities(limit) {
  try {
    const n = Math.min(40, Math.max(4, Number(limit) || 16));
    /** @type {object[]} */
    const out = [];

    function pid(prefix) {
      try {
        if (typeof crypto.randomUUID === "function") return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
        return `${prefix}-${Date.now()}`;
      } catch (_e) {
        return `${prefix}-${Date.now()}`;
      }
    }

    let dash = null;
    try {
      const { buildOperationalSnapshot } = require("../dashboard/dashboardAggregator");
      dash = buildOperationalSnapshot();
    } catch (_e0) {}

    try {
      const inv = (dash && dash.revenue && dash.revenue.unpaidInvoices) || {};
      const uc = Number(inv.unpaidCount) || 0;
      if (uc > 0) {
        const dollars = Number(inv.outstandingCents || 0) / 100;
        out.push({
          priorityId: pid("cash"),
          severity: uc > 6 ? "critical" : "high",
          category: "cash",
          title: "Unpaid invoice concentration",
          reason: `${uc} unpaid rows in snapshot; ~$${dollars.toFixed(2)} outstanding.`,
          recommendedAction: "Reconcile aging with Square/collections workflows (human decisions only).",
          confidence: dollars > 0 ? 0.72 : 0.55,
        });
      }
    } catch (_e1) {}

    try {
      const pr = dash && dash.production;
      if (pr && (Number(pr.lateJobsApprox) > 0 || Number(pr.tasksFailed) > 0)) {
        out.push({
          priorityId: pid("prod"),
          severity: Number(pr.tasksFailed) > 2 ? "high" : "medium",
          category: "production",
          title: "Production friction",
          reason: `Late≈${pr.lateJobsApprox}; orchestration failures≈${pr.tasksFailed}; queue≈${pr.queueSize}.`,
          recommendedAction: "Floor triage — art/blanks/path; no autonomous PO or schedule writes.",
          confidence: 0.68,
        });
      }
    } catch (_e2) {}

    try {
      const ap = dash && dash.approvals ? dash.approvals.pendingCount : 0;
      if (ap > 0) {
        out.push({
          priorityId: pid("apr"),
          severity: ap > 8 ? "high" : "medium",
          category: "approvals",
          title: "Approval backlog",
          reason: `${ap} approvals waiting in workflow ledger.`,
          recommendedAction: "Clear GET /api/approvals/pending with explicit approve/reject + reason.",
          confidence: 0.88,
        });
      }
    } catch (_e3) {}

    try {
      const tq = require("../agent/taskQueue");
      const stale = (tq.readAllTasksSync() || []).filter((t) => {
        if (String(t.status) !== "pending") return false;
        const ts = new Date(t.updatedAt || t.createdAt || 0).getTime();
        return Number.isFinite(ts) && Date.now() - ts > 72 * 3600000;
      }).length;
      if (stale > 0) {
        out.push({
          priorityId: pid("stale"),
          severity: "medium",
          category: "tasks",
          title: "Stale pending tasks",
          reason: `${stale} items pending beyond ~72h.`,
          recommendedAction: "Operator review queue + bridge reconciliation.",
          confidence: 0.66,
        });
      }
    } catch (_e4) {}

    try {
      const openEst = dash && dash.revenue && dash.revenue.estimateFollowups ? dash.revenue.estimateFollowups.openEstimatesApprox : 0;
      if (openEst > 0) {
        out.push({
          priorityId: pid("sales"),
          severity: "low",
          category: "sales",
          title: "Open estimates / inbound follow-ups",
          reason: `${openEst} open estimate-ish rows in heuristic snapshot.`,
          recommendedAction: "Human follow-ups and drafts — no outbound auto-send from Jarvis routes.",
          confidence: 0.5,
        });
      }
    } catch (_e5) {}

    try {
      if (dash && dash.processor && dash.processor.lock) {
        const lk = dash.processor.lock;
        if (lk.isProcessing) {
          out.push({
            priorityId: pid("proc"),
            severity: "medium",
            category: "system",
            title: "Processor lock active",
            reason: "Background processor lease shows in-flight execution.",
            recommendedAction: "Confirm heartbeats healthy; stale locks auto-clear after policy window elsewhere.",
            confidence: 0.55,
          });
        }
      }
    } catch (_e6) {}

    try {
      out.sort((a, b) => {
        const tier = { critical: 0, high: 1, medium: 2, low: 3 };
        const sa = tier[String(a.severity)] != null ? tier[String(a.severity)] : 4;
        const sb = tier[String(b.severity)] != null ? tier[String(b.severity)] : 4;
        return sa - sb;
      });
    } catch (_e7) {}

    return out.slice(0, n);
  } catch (_e) {
    return [];
  }
}

module.exports = { computeOperationalPriorities };
