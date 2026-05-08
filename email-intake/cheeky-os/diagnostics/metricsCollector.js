"use strict";

/**
 * Rolling metrics — persisted for operator trust / observability (no PII).
 */

const fs = require("fs");
const path = require("path");

const taskQueue = require("../agent/taskQueue");

const METRICS_FILE = path.join(taskQueue.DATA_DIR, "system-metrics.json");

const MAX_LAT_SAMPLES = 120;

function safeLoad() {
  try {
    taskQueue.ensureDirAndFiles();
    if (!fs.existsSync(METRICS_FILE)) {
      return defaultDoc();
    }
    const j = JSON.parse(fs.readFileSync(METRICS_FILE, "utf8"));
    return Object.assign(defaultDoc(), j && typeof j === "object" ? j : {});
  } catch (_e) {
    return defaultDoc();
  }
}

function defaultDoc() {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    requestsLastResetAt: new Date().toISOString(),
    requestTimestamps: [],
    failureTimestamps: [],
    connectorLatency: { graph: [], square: [] },
    taskDurationsMs: [],
    processorRuns: { count: 0, lastAt: null },
    queueDepthSamples: [],
    approvalBacklogSamples: [],
    notes: [],
  };
}

function persist(doc) {
  try {
    taskQueue.ensureDirAndFiles();
    const next = Object.assign(defaultDoc(), doc, { updatedAt: new Date().toISOString() });
    fs.writeFileSync(METRICS_FILE, JSON.stringify(next, null, 2), "utf8");
    return next;
  } catch (_e) {
    return doc;
  }
}

function trimTs(arr, cutoffMs, now) {
  try {
    return (Array.isArray(arr) ? arr : []).filter((t) => now - Number(t) < cutoffMs);
  } catch (_e) {
    return [];
  }
}

function bumpRequest(now) {
  try {
    const doc = safeLoad();
    doc.requestTimestamps.push(now);
    doc.requestTimestamps = trimTs(doc.requestTimestamps, 120000, now).slice(-2000);
    return persist(doc);
  } catch (_e) {
    return defaultDoc();
  }
}

function bumpFailure(now) {
  try {
    const doc = safeLoad();
    doc.failureTimestamps.push(now);
    doc.failureTimestamps = trimTs(doc.failureTimestamps, 3600000 * 48, now).slice(-4000);
    return persist(doc);
  } catch (_e) {
    return defaultDoc();
  }
}

function noteConnectorLatency(connectorKey, ms, ok) {
  try {
    const key = String(connectorKey || "unknown").slice(0, 32);
    const doc = safeLoad();
    if (!doc.connectorLatency) doc.connectorLatency = {};
    if (!doc.connectorLatency[key]) doc.connectorLatency[key] = [];
    doc.connectorLatency[key].push({
      ms: Math.max(0, Number(ms) || 0),
      ok: !!ok,
      at: new Date().toISOString(),
    });
    doc.connectorLatency[key] = doc.connectorLatency[key].slice(-MAX_LAT_SAMPLES);
    return persist(doc);
  } catch (_e) {
    return defaultDoc();
  }
}

function noteTaskDurationMs(ms, ok) {
  try {
    const doc = safeLoad();
    doc.taskDurationsMs.push({
      ms: Math.max(0, Number(ms) || 0),
      ok: !!ok,
      at: new Date().toISOString(),
    });
    doc.taskDurationsMs = doc.taskDurationsMs.slice(-400);
    return persist(doc);
  } catch (_e) {
    return defaultDoc();
  }
}

function sampleQueueDepth(n) {
  try {
    const doc = safeLoad();
    doc.queueDepthSamples.push({
      n: Math.max(0, Number(n) || 0),
      at: new Date().toISOString(),
    });
    doc.queueDepthSamples = doc.queueDepthSamples.slice(-200);
    return persist(doc);
  } catch (_e) {
    return defaultDoc();
  }
}

function sampleApprovalBacklog(n) {
  try {
    const doc = safeLoad();
    doc.approvalBacklogSamples.push({
      n: Math.max(0, Number(n) || 0),
      at: new Date().toISOString(),
    });
    doc.approvalBacklogSamples = doc.approvalBacklogSamples.slice(-200);
    return persist(doc);
  } catch (_e) {
    return defaultDoc();
  }
}

function bumpProcessorRun() {
  try {
    const doc = safeLoad();
    doc.processorRuns = doc.processorRuns || { count: 0, lastAt: null };
    doc.processorRuns.count = Number(doc.processorRuns.count || 0) + 1;
    doc.processorRuns.lastAt = new Date().toISOString();
    return persist(doc);
  } catch (_e) {}
}

function rollup() {
  try {
    const doc = safeLoad();
    const now = Date.now();
    const reqs = trimTs(doc.requestTimestamps || [], 60000, now);
    const fails = trimTs(doc.failureTimestamps || [], 3600000, now);
    const taskMs = doc.taskDurationsMs || [];
    let sum = 0;
    let ct = 0;
    for (let i = 0; i < taskMs.length; i++) {
      if (taskMs[i] && taskMs[i].ok === true) {
        sum += Number(taskMs[i].ms) || 0;
        ct += 1;
      }
    }

    /** @type {object} */
    const latRoll = {};
    const keys = Object.keys(doc.connectorLatency || {});
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const arr = (doc.connectorLatency[k] || []).slice(-60);
      let s = 0;
      let c = 0;
      for (let j = 0; j < arr.length; j++) {
        if (arr[j].ok !== false && Number(arr[j].ms) > 0) {
          s += Number(arr[j].ms);
          c += 1;
        }
      }
      latRoll[k] = { avgMs: c ? Math.round(s / c) : 0, samples: arr.length };
    }

    const lastQD = doc.queueDepthSamples && doc.queueDepthSamples.length ? doc.queueDepthSamples[doc.queueDepthSamples.length - 1] : null;
    const lastAp = doc.approvalBacklogSamples && doc.approvalBacklogSamples.length
      ? doc.approvalBacklogSamples[doc.approvalBacklogSamples.length - 1]
      : null;

    return {
      requestsPerMinute: reqs.length,
      failuresLastHour: fails.length,
      avgTaskDurationMs: ct ? Math.round(sum / ct) : 0,
      connectorLatency: latRoll,
      lastQueueDepth: lastQD,
      lastApprovalBacklog: lastAp,
      processorRuns: doc.processorRuns || {},
      updatedAt: doc.updatedAt,
    };
  } catch (_e) {
    return {
      requestsPerMinute: 0,
      failuresLastHour: 0,
      avgTaskDurationMs: 0,
      connectorLatency: {},
      lastQueueDepth: null,
      lastApprovalBacklog: null,
      processorRuns: {},
      updatedAt: null,
    };
  }
}

module.exports = {
  METRICS_FILE,
  bumpRequest,
  bumpFailure,
  bumpProcessorRun,
  noteConnectorLatency,
  noteTaskDurationMs,
  sampleQueueDepth,
  sampleApprovalBacklog,
  rollup,
  safeLoad,
};
