"use strict";

const fs = require("fs");

const taskQueue = require("../agent/taskQueue");
const safety = require("../agent/safetyGuard");
const processorLock = require("../agent/processorLock");
const graph = require("../connectors/graphEmailConnector");
const sqRead = require("../connectors/squareReadConnector");
const approvalEngine = require("../workflow/approvalEngine");
const metricsCollector = require("../diagnostics/metricsCollector");
const { validateTaskQueueFile } = require("../diagnostics/queueIntegrityGate");

function scoreSubsystem(name, score, weight) {
  return { name: String(name), score: Math.max(0, Math.min(100, Number(score) || 0)), weight: Number(weight) || 1 };
}

/**
 * @returns {{ overallTrustScore: number, subsystemScores: object[], warnings: string[], recommendations: string[] }}
 */
function computeTrustScore() {
  try {
    /** @type {object[]} */
    const subs = [];
    /** @type {string[]} */
    const warnings = [];
    /** @type {string[]} */
    const recommendations = [];

    let graphScore = 45;
    try {
      if (graph.isConfigured()) {
        graphScore = 70;
      } else {
        warnings.push("Microsoft Graph env not fully configured (mailbox reads disabled).");
        recommendations.push("Set MS_GRAPH_* variables for live email intelligence.");
      }
    } catch (_g) {
      graphScore = 30;
    }

    let sqScore = 45;
    try {
      if (sqRead.isConfiguredSync()) sqScore = 68;
      else {
        warnings.push("Square token missing — read intelligence limited to local JSON.");
        recommendations.push("Set SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID for live Square reads.");
      }
    } catch (_s) {}

    let queueScore = 80;
    try {
      const v = validateTaskQueueFile();
      if (v.corrupted) {
        queueScore = 35;
        warnings.push("Task queue JSONL has parse errors (see corrupted-task-lines.jsonl tail).");
        recommendations.push("Inspect quarantined lines; replay valid tasks manually.");
      }
    } catch (_q) {}

    let procScore = 75;
    try {
      const L = processorLock.readLock();
      const stale = processorLock.heartbeatAgeMs(L) > processorLock.STALE_MS;
      if (L.isProcessing && stale) {
        procScore = 40;
        warnings.push("Processor lock heartbeat looks stale.");
        recommendations.push("Processor lease should recover on next heartbeat or restart.");
      }
    } catch (_p) {}

    let auditScore = 70;
    try {
      if (fs.existsSync(safety.AUDIT_FILE)) {
        auditScore = 85;
      } else {
        warnings.push("Audit file not yet initialized on disk.");
      }
    } catch (_a) {}

    let exeScore = 72;
    try {
      const roll = metricsCollector.rollup();
      if (roll.failuresLastHour > 20) exeScore -= 25;
      if (roll.avgTaskDurationMs > 480000) exeScore -= 15;
      if (roll.failuresLastHour > 5) warnings.push("Elevated failure rate in traced HTTP/processor flows.");
    } catch (_r) {}

    let apprScore = 78;
    try {
      const pend = approvalEngine.getPendingApprovals().length;
      if (pend > 15) {
        apprScore -= 10;
        recommendations.push(`Clear approval backlog (${pend} pending).`);
      }
    } catch (_e2) {}

    subs.push(scoreSubsystem("connector_graph", graphScore, 1.2));
    subs.push(scoreSubsystem("connector_square", sqScore, 1.2));
    subs.push(scoreSubsystem("queue_integrity", queueScore, 1.5));
    subs.push(scoreSubsystem("processor_stability", procScore, 1));
    subs.push(scoreSubsystem("audit_completeness", auditScore, 1));
    subs.push(scoreSubsystem("execution_reliability", exeScore, 1.3));
    subs.push(scoreSubsystem("approval_integrity", apprScore, 1));

    let wSum = 0;
    let sSum = 0;
    for (let i = 0; i < subs.length; i++) {
      wSum += subs[i].weight;
      sSum += subs[i].score * subs[i].weight;
    }
    const overall = wSum ? Math.round(sSum / wSum) : 0;

    try {
      const tasks = taskQueue.readAllTasksSync();
      let stale = 0;
      let fail = 0;
      const now = Date.now();
      for (let i = 0; i < tasks.length; i++) {
        const t = tasks[i];
        if (!t) continue;
        if (String(t.status) === "failed") fail += 1;
        const ts = new Date(t.updatedAt || t.createdAt || 0).getTime();
        if (String(t.status) === "pending" && Number.isFinite(ts) && now - ts > 72 * 3600000) stale += 1;
      }
      const pct = tasks.length ? Math.round((100 * stale) / tasks.length) : 0;
      if (pct > 20) warnings.push(`Stale pending tasks ~${pct}% of queue.`);
    } catch (_st) {}

    if (overall < 60) recommendations.push("Run GET /api/observability/readiness for blocker detail.");

    return {
      overallTrustScore: overall,
      subsystemScores: subs,
      warnings,
      recommendations,
      generatedAt: new Date().toISOString(),
    };
  } catch (_e) {
    return {
      overallTrustScore: 0,
      subsystemScores: [],
      warnings: ["trust_engine_failed_closed"],
      recommendations: ["Inspect logs and readiness endpoint."],
      generatedAt: new Date().toISOString(),
    };
  }
}

module.exports = { computeTrustScore };
