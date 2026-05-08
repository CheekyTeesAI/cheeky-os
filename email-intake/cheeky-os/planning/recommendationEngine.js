"use strict";

const taskDecomposer = require("./taskDecomposer");

/**
 * Rank by simple static priority score — recommendations only.
 */

function scoreTaskShape(t) {
  try {
    const p = String((t && t.priority) || "").toLowerCase();
    if (p === "critical") return 4;
    if (p === "high") return 3;
    if (p === "medium") return 2;
    return 1;
  } catch (_e) {
    return 0;
  }
}

function recommendFromGoal(goalText) {
  try {
    const pack = taskDecomposer.decomposeToTaskObjects(goalText);
    const tasks = (pack.tasks || []).slice().sort((a, b) => scoreTaskShape(b) - scoreTaskShape(a));
    return {
      success: true,
      classification: pack.classification,
      recommendations: tasks.map((t, i) => ({
        rank: i + 1,
        task: t,
        rationale: `Priority weight ${scoreTaskShape(t)} for theme fit`,
      })),
    };
  } catch (_e) {
    return { success: false, classification: null, recommendations: [] };
  }
}

module.exports = {
  recommendFromGoal,
  scoreTaskShape,
};
