"use strict";

const { appendJson, readJson } = require("./dataStore");

const FILE = "intake.json";

/**
 * @param {string} message
 * @param {unknown} parsed
 * @param {unknown} result
 */
function logIntake(message, parsed, result) {
  try {
    const entry = {
      id: Date.now().toString() + "-" + Math.random().toString(36).slice(2, 8),
      createdAt: new Date().toISOString(),
      message: String(message || ""),
      parsed: parsed && typeof parsed === "object" ? parsed : { value: parsed },
      result: result && typeof result === "object" ? result : { value: result },
    };
    appendJson(FILE, entry);
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    console.error("[intakeStore] logIntake:", e.message);
  }
}

/**
 * @param {number} limit
 * @returns {Array<Record<string, unknown>>}
 */
function getIntake(limit = 100) {
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
  logIntake,
  getIntake,
};
