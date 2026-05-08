"use strict";

const fs = require("fs");

const safety = require("../agent/safetyGuard");
const graph = require("../connectors/graphEmailConnector");
const sqRead = require("../connectors/squareReadConnector");
const approvalEngine = require("../workflow/approvalEngine");
const traceEngine = require("../diagnostics/traceEngine");
const metricsCollector = require("../diagnostics/metricsCollector");
const { validateTaskQueueFile } = require("../diagnostics/queueIntegrityGate");

function fileExists(p) {
  try {
    return fs.existsSync(p);
  } catch (_e) {
    return false;
  }
}

/**
 * Activation readiness for daily operator use (fail-closed on corruption only).
 */
function runActivationReadiness() {
  try {
    /** @type {string[]} */
    const warnings = [];
    /** @type {string[]} */
    const blockers = [];
    /** @type {string[]} */
    const recommendedNextSteps = [];

    const q = validateTaskQueueFile();
    if (q.corrupted) {
      blockers.push("task_queue_corruption_detected");
      recommendedNextSteps.push("Review corrupted-task-lines.jsonl and repair task-queue.jsonl");
    }

    try {
      if (!graph.isConfigured()) warnings.push("MS_GRAPH_* not set — live mailbox Q&A disabled.");
    } catch (_g) {}

    try {
      if (!sqRead.isConfiguredSync()) warnings.push("Square not ready — live invoices/payments reads disabled.");
    } catch (_sq) {}

    try {
      const en = String(process.env.AGENT_PROCESSOR_ENABLED || "").toLowerCase().trim();
      if (en === "true") {
        warnings.push("Background processor enabled — ensure queue is reviewed; default safe is false.");
      }
    } catch (_p) {}

    if (!fileExists(safety.AUDIT_FILE)) warnings.push("Audit file not initialized (first event will create it).");

    try {
      approvalEngine.getPendingApprovals();
    } catch (_a) {
      warnings.push("approval_engine_unreadable");
    }

    try {
      const roll = metricsCollector.rollup();
      if (roll.failuresLastHour > 50) {
        warnings.push("High failure volume in last-hour trace window.");
      }
    } catch (_r) {}

    try {
      if (!fileExists(traceEngine.TRACE_FILE)) {
        recommendedNextSteps.push("Hit /api/observability/* once to initialize execution-traces.jsonl.");
      }
    } catch (_t) {}

    const ready = blockers.length === 0;
    return {
      ready,
      warnings,
      blockers,
      recommendedNextSteps,
      checks: {
        queueIntegrityOk: !!q.ok,
        graphEnvPresent: !!graph.isConfigured(),
        squareEnvPresent: !!sqRead.isConfiguredSync(),
        tracesFileExists: fileExists(traceEngine.TRACE_FILE),
        auditFileExists: fileExists(safety.AUDIT_FILE),
      },
      generatedAt: new Date().toISOString(),
    };
  } catch (e) {
    return {
      ready: false,
      warnings: [],
      blockers: [e.message || String(e)],
      recommendedNextSteps: ["Inspect server startup logs"],
      checks: {},
      generatedAt: new Date().toISOString(),
    };
  }
}

module.exports = { runActivationReadiness };
