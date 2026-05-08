"use strict";

const fs = require("fs");
const path = require("path");

const taskQueue = require("../agent/taskQueue");

const MEM_FILE = path.join(taskQueue.DATA_DIR, "operator-session-memory.json");
const MAX_EACH = 100;

function defaultDoc() {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    recentQueries: [],
    recentRecommendations: [],
    recentApprovals: [],
    activeOperationalFocus: null,
    recentFailures: [],
    ongoingBuilds: [],
  };
}

function load() {
  taskQueue.ensureDirAndFiles();
  try {
    if (!fs.existsSync(MEM_FILE)) {
      const d = defaultDoc();
      fs.writeFileSync(MEM_FILE, JSON.stringify(d, null, 2), "utf8");
      return d;
    }
    const j = JSON.parse(fs.readFileSync(MEM_FILE, "utf8"));
    return Object.assign(defaultDoc(), j && typeof j === "object" ? j : {});
  } catch (_e) {
    return defaultDoc();
  }
}

function save(doc) {
  try {
    taskQueue.ensureDirAndFiles();
    const next = Object.assign(defaultDoc(), doc, { updatedAt: new Date().toISOString() });
    fs.writeFileSync(MEM_FILE, JSON.stringify(next, null, 2), "utf8");
    return next;
  } catch (_e) {
    return doc;
  }
}

function trimArr(arr, n) {
  const a = Array.isArray(arr) ? arr.slice(-n) : [];
  return a;
}

/**
 * @param {string} kind
 * @param {object} payload
 */
function rememberInteraction(kind, payload) {
  const doc = load();
  const row = {
    kind: String(kind || "event").slice(0, 64),
    at: new Date().toISOString(),
    payload: payload && typeof payload === "object" ? payload : { value: payload },
  };

  if (kind === "query" || kind === "operator_query") {
    doc.recentQueries = trimArr(doc.recentQueries.concat([row]), MAX_EACH);
  } else if (kind === "recommendation" || kind === "recommendations") {
    doc.recentRecommendations = trimArr(doc.recentRecommendations.concat([row]), MAX_EACH);
  } else if (kind === "approval") {
    doc.recentApprovals = trimArr(doc.recentApprovals.concat([row]), MAX_EACH);
  } else if (kind === "failure") {
    doc.recentFailures = trimArr(doc.recentFailures.concat([row]), MAX_EACH);
  } else if (kind === "build" || kind === "ongoing_build") {
    doc.ongoingBuilds = trimArr(doc.ongoingBuilds.concat([row]), MAX_EACH);
  } else if (kind === "focus" || kind === "operational_focus") {
    doc.activeOperationalFocus = row;
  } else {
    doc.recentQueries = trimArr(doc.recentQueries.concat([row]), MAX_EACH);
  }

  return save(doc);
}

function getRecentContext() {
  return load();
}

function getCurrentOperationalFocus() {
  const d = load();
  return d.activeOperationalFocus || null;
}

function summarizeRecentActivity() {
  const d = load();
  const parts = [];
  parts.push(`Queries (last ${d.recentQueries.length})`);
  parts.push(`Recommendations logged (last ${d.recentRecommendations.length})`);
  parts.push(`Approval events (last ${d.recentApprovals.length})`);
  parts.push(`Failures noted (last ${d.recentFailures.length})`);
  parts.push(`Ongoing builds (last ${d.ongoingBuilds.length})`);
  if (d.activeOperationalFocus && d.activeOperationalFocus.at) {
    parts.push(`Current focus snapshot at ${d.activeOperationalFocus.kind || "focus"} (${d.activeOperationalFocus.at})`);
  }
  return parts.join("; ");
}

module.exports = {
  MEM_FILE,
  rememberInteraction,
  getRecentContext,
  getCurrentOperationalFocus,
  summarizeRecentActivity,
};
