"use strict";

const { appendJson, readJson } = require("./dataStore");

const FILE = "events.json";

/**
 * @param {string} type
 * @param {Record<string, unknown>} payload
 */
function logEvent(type, payload) {
  try {
    const entry = {
      id: Date.now().toString() + "-" + Math.random().toString(36).slice(2, 8),
      type: String(type || "unknown"),
      createdAt: new Date().toISOString(),
      payload: payload && typeof payload === "object" ? payload : { value: payload },
    };
    appendJson(FILE, entry);
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    console.error("[eventStore] logEvent:", e.message);
  }
}

/**
 * @param {number} limit
 * @returns {Array<Record<string, unknown>>}
 */
function getEvents(limit = 100) {
  try {
    const arr = readJson(FILE, []);
    if (!Array.isArray(arr)) return [];
    const n = Math.max(1, Math.min(500, limit));
    return arr.slice(-n).reverse();
  } catch {
    return [];
  }
}

module.exports = {
  logEvent,
  getEvents,
};
