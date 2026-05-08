"use strict";

const fs = require("fs");
const path = require("path");

const taskQueue = require("../agent/taskQueue");
const taskProcessor = require("../agent/taskProcessor");
const processorLock = require("../agent/processorLock");
const approvalEngine = require("../workflow/approvalEngine");
const safety = require("../agent/safetyGuard");

/** Repo-root `data/` (CheekyAPI/data) when present */
const ROOT_DATA = path.join(__dirname, "..", "..", "..", "data");

function safeReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_e) {
    return null;
  }
}

function tailJsonl(filePath, maxLines) {
  const n = Math.min(800, Math.max(5, Number(maxLines) || 80));
  try {
    if (!fs.existsSync(filePath)) return [];
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
    return lines.slice(-n);
  } catch (_e) {
    return [];
  }
}

function parseTailRows(filePath, maxLines) {
  const out = [];
  const raw = tailJsonl(filePath, maxLines);
  for (let i = 0; i < raw.length; i++) {
    try {
      out.push(JSON.parse(raw[i]));
    } catch (_e) {}
  }
  return out;
}

function summarizeInvoices(poData) {
  try {
    const rows = Array.isArray(poData)
      ? poData
      : poData && Array.isArray(poData.orders)
        ? poData.orders
        : poData && Array.isArray(poData.purchaseOrders)
          ? poData.purchaseOrders
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

function estimateFollowupsFromIntake(intakeBlob) {
  try {
    const recs = intakeBlob && Array.isArray(intakeBlob.records) ? intakeBlob.records : [];
    let open = 0;
    const now = Date.now();
    for (let i = 0; i < recs.length; i++) {
      const r = recs[i] || {};
      const st = String(r.status || r.stage || "").toLowerCase();
      if (/closed|won|lost|converted/.test(st)) continue;
      open += 1;
      void now;
    }
    return { openEstimatesApprox: open, note: "heuristic_from_intake_json_if_present" };
  } catch (_e) {
    return { openEstimatesApprox: 0 };
  }
}

function productionHeuristic(serviceDesk) {
  try {
    const items = serviceDesk && Array.isArray(serviceDesk.items) ? serviceDesk.items : [];
    let missingArt = 0;
    let missingBlanks = 0;
    let lateApprox = 0;
    const now = Date.now();
    for (let i = 0; i < items.length; i++) {
      const it = items[i] || {};
      const tags = `${it.tags || ""} ${it.notes || ""} ${it.status || ""}`.toLowerCase();
      if (/missing art|no art|art missing/.test(tags)) missingArt += 1;
      if (/missing blank|need blank|blank tbd/.test(tags)) missingBlanks += 1;
      const due = it.dueAt || it.dueDate || it.promiseDate;
      if (due) {
        const t = new Date(due).getTime();
        if (Number.isFinite(t) && t < now - 86400000) lateApprox += 1;
      }
    }
    return {
      queueSize: items.length,
      missingArt,
      missingBlanks,
      lateJobsApprox: lateApprox,
    };
  } catch (_e) {
    return { queueSize: 0, missingArt: 0, missingBlanks: 0, lateJobsApprox: 0 };
  }
}

function anomalyAuditSignals(rows) {
  let missingAuditId = 0;
  let rateLimited = 0;
  let failures = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || {};
    if (!r.auditId) missingAuditId += 1;
    const et = String(r.eventType || "");
    if (et === "rate_limit_hit") rateLimited += 1;
    if (/failed|blocked|reject/i.test(et)) failures += 1;
  }
  return { missingAuditId, rateLimited, failureSignals: failures };
}

/**
 * Unified snapshot for operator dashboard (read-only advisory).
 * @returns {object}
 */
function buildOperationalSnapshot() {
  taskQueue.ensureDirAndFiles();

  const tasks = taskQueue.readAllTasksSync ? taskQueue.readAllTasksSync() : [];
  const approved = tasks.filter((t) => String(t.status) === "approved");
  const running = tasks.filter((t) => String(t.status) === "running");
  const failed = tasks.filter((t) => String(t.status) === "failed");

  const pendingApprovals = approvalEngine.getPendingApprovals();
  const hb = taskProcessor.readHb();
  const lock = processorLock.readLock();

  const purchaseOrders = safeReadJson(path.join(ROOT_DATA, "purchase-orders.json"));
  const intake = safeReadJson(path.join(ROOT_DATA, "intake-records.json"));
  const desk = safeReadJson(path.join(ROOT_DATA, "service-desk-items.json"));

  const inv = summarizeInvoices(purchaseOrders || {});
  const auditTail = parseTailRows(safety.AUDIT_FILE, 120);
  const runTail = parseTailRows(path.join(taskQueue.DATA_DIR, "agent-run-log.jsonl"), 60);

  let recs = [];
  try {
    const { generateRecommendations } = require("../intelligence/recommendationEngine");
    recs = generateRecommendations();
  } catch (_r) {
    recs = [];
  }

  const est = estimateFollowupsFromIntake(intake);
  const prod = productionHeuristic(desk || {});
  const anom = anomalyAuditSignals(auditTail);
  const failRuns = runTail.filter((x) => x && x.success === false).length;

  /** @type {object[]} */
  const alerts = [];
  if (anom.missingAuditId) {
    alerts.push({
      severity: "warning",
      code: "audit_ids_missing_in_tail",
      count: anom.missingAuditId,
      description: "Some recent audit rows lack auditId (tail window only).",
    });
  }
  if (anom.rateLimited) {
    alerts.push({
      severity: "info",
      code: "rate_limit_events_in_tail",
      count: anom.rateLimited,
    });
  }
  if (failRuns) {
    alerts.push({
      severity: "warning",
      code: "recent_agent_run_failures",
      count: failRuns,
    });
  }
  if (pendingApprovals.length > 8) {
    alerts.push({
      severity: "medium",
      code: "approval_backlog",
      count: pendingApprovals.length,
    });
  }
  if (failed.length) {
    alerts.push({
      severity: "warning",
      code: "failed_tasks_present",
      count: failed.length,
    });
  }

  return {
    revenue: {
      unpaidInvoices: inv,
      estimateFollowups: est,
      pulseNote: inv.unpaidCount
        ? `${inv.unpaidCount} unpaid invoices in local snapshot (purchase-orders.json when present)`
        : "No unpaid invoice rows detected in snapshot (or file missing)",
    },
    production: Object.assign({}, prod, {
      tasksRunning: running.length,
      tasksFailed: failed.length,
      tasksApprovedQueued: approved.length,
    }),
    approvals: {
      pendingCount: pendingApprovals.length,
      pending: pendingApprovals.slice(0, 24),
    },
    processor: {
      heartbeat: hb,
      lock,
      staleLockMsThreshold: processorLock.STALE_MS,
    },
    alerts,
    recommendations: Array.isArray(recs) ? recs.slice(0, 24) : [],
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { buildOperationalSnapshot, ROOT_DATA };
