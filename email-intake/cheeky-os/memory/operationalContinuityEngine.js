"use strict";

const fs = require("fs");
const path = require("path");

const taskQueue = require("../agent/taskQueue");

const FILE = path.join(taskQueue.DATA_DIR, "operational-continuity.json");
const MAX_ITEMS = 120;

function defaultDoc() {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    recentOperationalFocus: [],
    unresolvedRisks: [],
    activeApprovalsSnapshot: [],
    recurringFailures: [],
    recentRecommendations: [],
    strategicGoals: [],
    lastExecutionCorrelationId: null,
  };
}

function load() {
  try {
    taskQueue.ensureDirAndFiles();
    if (!fs.existsSync(FILE)) {
      const d = defaultDoc();
      fs.writeFileSync(FILE, JSON.stringify(d, null, 2), "utf8");
      return d;
    }
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return Object.assign(defaultDoc(), raw && typeof raw === "object" ? raw : {});
  } catch (_e) {
    return defaultDoc();
  }
}

function save(doc) {
  try {
    taskQueue.ensureDirAndFiles();
    const next = Object.assign(defaultDoc(), doc, { updatedAt: new Date().toISOString() });
    fs.writeFileSync(FILE, JSON.stringify(next, null, 2), "utf8");
    return next;
  } catch (_e) {
    return doc;
  }
}

function trimList(key, doc, incoming) {
  try {
    const cur = Array.isArray(doc[key]) ? doc[key] : [];
    const neu = Array.isArray(incoming) ? incoming : [];
    doc[key] = cur.concat(neu).slice(-MAX_ITEMS);
    return doc;
  } catch (_e) {
    return doc;
  }
}

/** @returns {object} merged snapshot saved */
function pulseFromOperationalState(patch) {
  try {
    const doc = load();
    const p = patch && typeof patch === "object" ? patch : {};
    if (p.unresolvedRisks) trimList("unresolvedRisks", doc, p.unresolvedRisks);
    if (p.recurringFailures) trimList("recurringFailures", doc, p.recurringFailures);
    if (p.activeApprovalsSnapshot) trimList("activeApprovalsSnapshot", doc, p.activeApprovalsSnapshot);
    if (p.strategicGoals) trimList("strategicGoals", doc, p.strategicGoals);
    if (p.recentRecommendations) trimList("recentRecommendations", doc, p.recentRecommendations);
    if (p.recentOperationalFocus) trimList("recentOperationalFocus", doc, p.recentOperationalFocus);
    return save(doc);
  } catch (_e) {
    return load();
  }
}

function recordInteractionTurn(ev) {
  try {
    const doc = load();
    trimList(
      "recentOperationalFocus",
      doc,
      [
        Object.assign({}, ev, {
          at: new Date().toISOString(),
        }),
      ]
    );
    return save(doc);
  } catch (_e) {
    return load();
  }
}

function recordExecutionResult(res) {
  try {
    const doc = load();
    doc.lastExecutionCorrelationId = res.correlationId != null ? String(res.correlationId) : doc.lastExecutionCorrelationId;
    if (res.ok === false) {
      trimList("recurringFailures", doc, [Object.assign({}, res, { at: new Date().toISOString() })]);
    }
    return save(doc);
  } catch (_e) {
    return load();
  }
}

function getContinuitySnapshot() {
  try {
    const doc = load();
    let pendingApprovals = [];
    /** @type {object} */
    const view = Object.assign({}, doc);
    try {
      const ae = require("../workflow/approvalEngine");
      pendingApprovals = ae.getPendingApprovals().slice(0, 40);
      view.activeApprovalsSnapshot = pendingApprovals.map((x) => ({
        approvalId: x.approvalId,
        taskId: x.taskId,
        status: x.status,
        riskLevel: x.riskLevel,
      }));
    } catch (_apr) {}

    try {
      const { generateRecommendations } = require("../intelligence/recommendationEngine");
      const rec = generateRecommendations().slice(0, 24);
      view.recentRecommendationsPreview = rec.map((r) => ({
        recommendationId: r.recommendationId,
        category: r.category,
        severity: r.severity,
        title: r.title,
      }));
    } catch (_r) {}

    return view;
  } catch (_e) {
    return defaultDoc();
  }
}

module.exports = {
  FILE,
  pulseFromOperationalState,
  recordInteractionTurn,
  recordExecutionResult,
  getContinuitySnapshot,
};
