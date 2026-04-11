"use strict";

/**
 * @typedef {{ name: string, success: boolean, mode: string, message: string }} ExecStep
 * @typedef {{ action: string, mode: "live"|"stub"|"mixed", steps: ExecStep[] }} Execution
 */

/**
 * @param {string} action
 * @returns {Execution}
 */
function createExecution(action) {
  return { action, mode: "stub", steps: [] };
}

/**
 * @param {Execution} exec
 * @param {string} name
 * @param {{ success?: boolean, mode?: string, message?: string }} result
 */
function addStep(exec, name, result) {
  const mode = String(result.mode || "stub");
  const success = result.success !== false;
  exec.steps.push({
    name,
    success,
    mode,
    message: String(result.message || ""),
  });
}

/**
 * @param {Execution} exec
 */
function finalizeMode(exec) {
  const modes = new Set(exec.steps.map((s) => s.mode));
  if (modes.has("live") && modes.has("stub")) {
    exec.mode = "mixed";
  } else if (modes.has("live")) {
    exec.mode = "live";
  } else {
    exec.mode = "stub";
  }
}

/**
 * @param {Execution} exec
 */
function overallSuccess(exec) {
  if (exec.steps.length === 0) return true;
  return exec.steps.every(
    (s) =>
      s.success ||
      (String(s.mode) === "stub" && s.name !== "error")
  );
}

/**
 * @param {string} s
 */
function slug(s) {
  return String(s || "entry")
    .replace(/[^a-z0-9-_]+/gi, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80) || "entry";
}

module.exports = {
  createExecution,
  addStep,
  finalizeMode,
  overallSuccess,
  slug,
};
