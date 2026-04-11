"use strict";

/** Stage → max hours before considered stuck */
const THRESHOLDS = {
  INTAKE: 2,
  ART: 8,
  PRINT: 24,
  QC: 8,
};

/**
 * @param {Record<string, unknown>} task
 * @returns {number}
 */
function getTaskAgeHours(task) {
  const ref = String(task.updatedAt || task.createdAt || "");
  const t = Date.parse(ref);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, (Date.now() - t) / (1000 * 60 * 60));
}

/**
 * @param {Array<Record<string, unknown>>} tasks
 * @returns {Array<Record<string, unknown> & { ageHours: number; thresholdHours: number }>}
 */
function getStuckTasks(tasks) {
  if (!Array.isArray(tasks)) return [];
  const out = [];
  for (const task of tasks) {
    const stage = String(task.stage || "");
    if (stage === "COMPLETE") continue;
    const th = THRESHOLDS[stage];
    if (th === undefined) continue;
    const ageHours = getTaskAgeHours(task);
    if (ageHours > th) {
      out.push({
        ...task,
        ageHours,
        thresholdHours: th,
      });
    }
  }
  return out;
}

module.exports = {
  getStuckTasks,
  getTaskAgeHours,
  THRESHOLDS,
};
