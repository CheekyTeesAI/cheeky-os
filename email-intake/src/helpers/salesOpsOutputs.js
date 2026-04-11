"use strict";

const fs = require("fs");
const path = require("path");

function outreachDir() {
  return path.join(__dirname, "..", "..", "outputs", "outreach");
}

function dailyDir() {
  return path.join(__dirname, "..", "..", "outputs", "daily");
}

function revenueDir() {
  return path.join(__dirname, "..", "..", "outputs", "revenue");
}

function getLatestOutreachBatchJsonPath() {
  const dir = outreachDir();
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("outreach-batch-") && f.endsWith(".json"));
  if (files.length === 0) return null;
  let bestPath = null;
  let bestMs = 0;
  for (const f of files) {
    const p = path.join(dir, f);
    try {
      const st = fs.statSync(p);
      if (st.mtimeMs >= bestMs) {
        bestMs = st.mtimeMs;
        bestPath = p;
      }
    } catch (_e) {
      /* skip */
    }
  }
  return bestPath;
}

function readLatestBatchProcessed() {
  const latest = getLatestOutreachBatchJsonPath();
  if (!latest) return 0;
  try {
    const data = JSON.parse(fs.readFileSync(latest, "utf8"));
    const n = data.processed;
    return typeof n === "number" ? n : 0;
  } catch (_e) {
    return 0;
  }
}

function getLatestDailySummaryJsonPath() {
  const dir = dailyDir();
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("daily-summary-") && f.endsWith(".json"));
  if (files.length === 0) return null;
  let bestPath = null;
  let bestMs = 0;
  for (const f of files) {
    const p = path.join(dir, f);
    try {
      const st = fs.statSync(p);
      if (st.mtimeMs >= bestMs) {
        bestMs = st.mtimeMs;
        bestPath = p;
      }
    } catch (_e) {
      /* skip */
    }
  }
  return bestPath;
}

function latestFileByPrefix(dir, prefix, suffix) {
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(suffix));
  if (files.length === 0) return null;
  let bestPath = null;
  let bestMs = 0;
  for (const f of files) {
    const p = path.join(dir, f);
    try {
      const st = fs.statSync(p);
      if (st.mtimeMs >= bestMs) {
        bestMs = st.mtimeMs;
        bestPath = p;
      }
    } catch (_e) {
      /* skip */
    }
  }
  return bestPath;
}

function getLatestRevenueCommandJsonPath() {
  return latestFileByPrefix(revenueDir(), "revenue-command-", ".json");
}

function getRepliesLogPath() {
  return path.join(revenueDir(), "replies.json");
}

function getConversionsLogPath() {
  return path.join(revenueDir(), "conversions.json");
}

module.exports = {
  outreachDir,
  dailyDir,
  revenueDir,
  getLatestOutreachBatchJsonPath,
  readLatestBatchProcessed,
  getLatestDailySummaryJsonPath,
  getLatestRevenueCommandJsonPath,
  getRepliesLogPath,
  getConversionsLogPath
};
