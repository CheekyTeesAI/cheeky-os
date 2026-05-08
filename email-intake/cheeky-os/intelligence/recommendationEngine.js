"use strict";

const crypto = require("crypto");

const taskQueue = require("../agent/taskQueue");
const approvalEngine = require("../workflow/approvalEngine");
const dashboardAggregator = require("../dashboard/dashboardAggregator");

function newRecommendationId(prefix) {
  const p = String(prefix || "rec").replace(/[^a-z0-9_-]/gi, "");
  try {
    if (typeof crypto.randomUUID === "function") return `${p}-${crypto.randomUUID()}`;
    return `${p}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  } catch (_e) {
    return `${p}-${Date.now()}`;
  }
}

function taskAgeHours(task) {
  try {
    const raw = task.updatedAt || task.createdAt || task.requestedAt;
    if (!raw) return null;
    const t = new Date(raw).getTime();
    if (!Number.isFinite(t)) return null;
    return Math.max(0, (Date.now() - t) / 3600000);
  } catch (_e) {
    return null;
  }
}

function safeInvUnpaidSnapshot() {
  try {
    const fs = require("fs");
    const path = require("path");
    const p = path.join(dashboardAggregator.ROOT_DATA, "purchase-orders.json");
    if (!fs.existsSync(p)) return { unpaidCount: 0, outstandingCents: 0 };
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    const rows = Array.isArray(j)
      ? j
      : j && Array.isArray(j.orders)
        ? j.orders
        : [];
    let unpaid = 0;
    let cents = 0;
    for (let i = 0; i < rows.length; i++) {
      const st = String(rows[i].status || rows[i].paymentStatus || "").toLowerCase();
      if (/paid|completed/.test(st)) continue;
      unpaid += 1;
      const amt = Number(rows[i].totalMoney?.amount ?? rows[i].totalCents ?? 0);
      if (Number.isFinite(amt)) cents += amt;
    }
    return { unpaidCount: unpaid, outstandingCents: cents };
  } catch (_e) {
    return { unpaidCount: 0, outstandingCents: 0 };
  }
}

/**
 * Operational recommendations only — no side effects, no outbound actions.
 * @returns {object[]}
 */
function generateRecommendations() {
  taskQueue.ensureDirAndFiles();

  /** @type {object[]} */
  const out = [];

  const tasks = taskQueue.readAllTasksSync();
  const pending = tasks.filter((t) => String(t.status) === "pending");
  const failed = tasks.filter((t) => String(t.status) === "failed");
  const approvedQ = tasks.filter((t) => String(t.status) === "approved");

  const aprPending = approvalEngine.getPendingApprovals();
  if (aprPending.length) {
    out.push({
      recommendationId: newRecommendationId("apr"),
      category: "operations",
      severity: aprPending.length > 5 ? "high" : "medium",
      title: "Approval backlog",
      description: `${aprPending.length} workflow approvals are pending operator review.`,
      suggestedAction: "Review GET /api/approvals/pending and approve or reject with a logged reason.",
      relatedEntities: aprPending.slice(0, 8).map((r) => ({ approvalId: r.approvalId, taskId: r.taskId })),
      confidence: 0.92,
    });
  }

  if (approvedQ.length > 12) {
    out.push({
      recommendationId: newRecommendationId("prodq"),
      category: "production",
      severity: "medium",
      title: "Processor queue depth",
      description: `${approvedQ.length} tasks are approved and waiting for the background processor.`,
      suggestedAction:
        "Confirm AGENT_PROCESSOR_ENABLED and interval, or execute tasks manually via the bridge run path.",
      relatedEntities: approvedQ.slice(0, 6).map((t) => ({ taskId: t.taskId, intent: t.intent })),
      confidence: 0.78,
    });
  }

  let staleCandidates = 0;
  for (let i = 0; i < pending.length; i++) {
    const h = taskAgeHours(pending[i]);
    if (h != null && h > 72) staleCandidates += 1;
  }
  if (staleCandidates) {
    out.push({
      recommendationId: newRecommendationId("stale"),
      category: "operations",
      severity: "medium",
      title: "Stale pending tasks",
      description: `${staleCandidates} tasks have been pending for more than ~72 hours.`,
      suggestedAction: "Inspect queue for stuck items, reconcile with approvals, or reject with audit trail.",
      relatedEntities: [],
      confidence: 0.7,
    });
  }

  if (failed.length) {
    out.push({
      recommendationId: newRecommendationId("fail"),
      category: "operations",
      severity: "high",
      title: "Failed tasks need attention",
      description: `${failed.length} tasks are in failed state (retry cooldown may apply).`,
      suggestedAction: "Review failure reasons in audit + agent-run logs; reopen only after root-cause.",
      relatedEntities: failed.slice(0, 6).map((t) => ({ taskId: t.taskId })),
      confidence: 0.85,
    });
  }

  const inv = safeInvUnpaidSnapshot();
  if (inv.unpaidCount > 0) {
    const dollars = (inv.outstandingCents || 0) / 100;
    out.push({
      recommendationId: newRecommendationId("ar"),
      category: "finance",
      severity: inv.unpaidCount > 6 ? "high" : "medium",
      title: "Unpaid invoice exposure (local snapshot)",
      description: `${inv.unpaidCount} unpaid rows; ~$${dollars.toFixed(2)} outstanding in JSON snapshot.`,
      suggestedAction: "Reconcile Square / collections workflows; no autonomous charge or comms.",
      relatedEntities: [{ source: "data/purchase-orders.json" }],
      confidence: inv.outstandingCents > 0 ? 0.65 : 0.5,
    });
  }

  if (
    pending.some((t) => /estimate|quote/i.test(`${String(t.intent || "")} ${String(t.target || "")}`))
  ) {
    out.push({
      recommendationId: newRecommendationId("est"),
      category: "sales",
      severity: "low",
      title: "Open estimate / quote signals in queue",
      description: "One or more pending tasks mention estimates or quotes.",
      suggestedAction: "Schedule human follow-up; drafts only unless operator sends.",
      relatedEntities: pending
        .filter((t) => /estimate|quote/i.test(JSON.stringify(t)))
        .slice(0, 5)
        .map((t) => ({ taskId: t.taskId })),
      confidence: 0.55,
    });
  }

  return out.slice(0, 40);
}

module.exports = { generateRecommendations };
