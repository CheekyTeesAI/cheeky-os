"use strict";

const { ensureDataFiles, readJson, writeJson } = require("./dataStore");

const FILE = "estimates.json";

/**
 * @returns {Array<Record<string, unknown>>}
 */
function getEstimates() {
  try {
    ensureDataFiles();
    const arr = readJson(FILE, []);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function persist(list) {
  writeJson(FILE, list);
}

/**
 * @param {Record<string, unknown>} rec
 */
function logEstimate(rec) {
  try {
    const list = getEstimates();
    const now = new Date().toISOString();
    const base = rec && typeof rec === "object" ? rec : {};
    const row = {
      ...base,
      id: String(base.id || `est-${Date.now()}`),
      customer: String(base.customer != null ? base.customer : "Customer"),
      email: base.email != null ? String(base.email) : "",
      amount: Number(base.amount) || 0,
      status: String(base.status || "sent"),
      createdAt: String(base.createdAt || now),
      lastFollowUpAt:
        base.lastFollowUpAt != null ? String(base.lastFollowUpAt) : null,
      followUpLevel: Number(base.followUpLevel) || 0,
    };
    list.push(row);
    persist(list);
    return row;
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    console.error("[estimateStore] logEstimate:", e.message);
    return null;
  }
}

/**
 * @param {string} id
 * @param {string} status
 */
function updateEstimateStatus(id, status) {
  try {
    const list = getEstimates();
    const e = list.find((x) => String(x.id) === String(id));
    if (!e) return null;
    e.status = String(status || "sent");
    persist(list);
    return e;
  } catch {
    return null;
  }
}

/**
 * @param {string} id
 * @param {number} level
 * @param {string | null} lastFollowUpAt
 */
function updateFollowUpState(id, level, lastFollowUpAt) {
  try {
    const list = getEstimates();
    const e = list.find((x) => String(x.id) === String(id));
    if (!e) return null;
    e.followUpLevel = level;
    e.lastFollowUpAt = lastFollowUpAt;
    persist(list);
    return e;
  } catch {
    return null;
  }
}

module.exports = {
  logEstimate,
  getEstimates,
  updateEstimateStatus,
  updateFollowUpState,
};
