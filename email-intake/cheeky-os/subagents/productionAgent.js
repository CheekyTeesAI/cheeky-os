"use strict";

const fs = require("fs");
const path = require("path");

const taskQueue = require("../agent/taskQueue");

const REPO_DATA = path.join(__dirname, "..", "..", "..", "data");

function queueSummary() {
  try {
    /** @type {Record<string, number>} */
    const c = { pending: 0, approved: 0, running: 0, completed: 0, failed: 0 };
    taskQueue.readAllTasksSync().forEach((t) => {
      const s = String(t.status || "");
      if (typeof c[s] === "number") c[s]++;
    });
    return { readonly: true, orchestrationTasks: c };
  } catch (e) {
    return { readonly: true, error: e.message || String(e) };
  }
}

function loadJobs() {
  try {
    const fp = path.join(REPO_DATA, "cheeky-jobs.json");
    if (!fs.existsSync(fp)) return { rows: [], path: fp };
    const j = JSON.parse(fs.readFileSync(fp, "utf8"));
    /** @type {unknown[]} */
    let rows = [];
    if (Array.isArray(j)) rows = j;
    else if (j && typeof j === "object" && Array.isArray(j.jobs)) rows = j.jobs;
    return { rows, path: fp };
  } catch (_e) {
    return { rows: [], path: path.join(REPO_DATA, "cheeky-jobs.json") };
  }
}

function overdueJobs(max) {
  try {
    const { rows } = loadJobs();
    const now = Date.now();
    const lim = Math.min(200, Number(max) || 40);
    /** @type {object[]} */
    const late = [];
    rows.forEach((row) => {
      if (!row || typeof row !== "object" || late.length >= lim) return;
      const ds = row.dueDate || row.due || row.needsBy || row.deadline;
      if (!ds) return;
      const t = new Date(ds).getTime();
      if (Number.isFinite(t) && t < now) late.push(row);
    });
    return { readonly: true, overdueCount: late.length, preview: late };
  } catch (_e) {
    return { readonly: true, overdueCount: 0, preview: [] };
  }
}

function loadAnalysis() {
  try {
    const q = queueSummary();
    const { rows } = loadJobs();
    /** @type {Record<string, number>} */
    const stageCount = {};
    rows.forEach((x) => {
      if (!x || typeof x !== "object") return;
      const key = String(x.stage || x.status || "?");
      stageCount[key] = (stageCount[key] || 0) + 1;
    });
    return {
      readonly: true,
      queue: q.orchestrationTasks,
      cheekyJobs: rows.length,
      stageCount,
    };
  } catch (e) {
    return { readonly: true, error: e.message || String(e) };
  }
}

module.exports = {
  queueSummary,
  overdueJobs,
  loadAnalysis,
};
