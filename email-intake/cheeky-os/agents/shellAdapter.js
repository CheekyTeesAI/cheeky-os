"use strict";

const { whitelistExecute } = require("../agent/agentRunner");

/**
 * Wrapper over existing agentRunner gates — sanitizes + rejects chaining.
 */

function sanitizeLine(cmd) {
  try {
    return String(cmd || "").replace(/\r?\n+/g, " ").trim().slice(0, 8192);
  } catch (_e) {
    return "";
  }
}

function validateOnly(command) {
  try {
    const line = sanitizeLine(command);
    if (!line) return { ok: false, stage: "empty", normalized: "", gate: whitelistExecute("") };
    return { ok: true, normalized: line, gate: whitelistExecute(line) };
  } catch (e) {
    return { ok: false, stage: "exception", normalized: "", error: e.message || String(e) };
  }
}

/**
 * @param {string} command
 * @param {object=} opts
 */
async function runWhitelisted(command, opts) {
  try {
    const dry = !opts || opts.dryRun !== false;
    const v = validateOnly(command);
    if (!v.ok || !v.gate || !v.gate.ok) {
      return {
        success: false,
        adapter: "shell",
        dryRun: true,
        rejected: true,
        reason: v.gate && v.gate.error ? v.gate.error : v.error || "invalid",
        normalized: v.normalized,
      };
    }
    if (dry) {
      return {
        success: true,
        adapter: "shell",
        dryRun: true,
        normalized: v.normalized,
        wouldRun: `[dry-run-shell]\t${v.normalized}`,
        note: "call_agentRunner_runTask_to_execute_whitelisted_commands",
      };
    }

    const agentRunner = require("../agent/agentRunner");
    /** synthetic task envelope */
    const st = Object.assign(opts && opts.taskEnvelope ? opts.taskEnvelope : {}, {
      intent: "execute",
      target: v.normalized,
      requirements: ["shellAdapter_whitelisted_execution"],
      taskId: (opts && opts.taskId) || `shell-${Date.now()}`,
    });

    const out = await agentRunner.runTask(st);
    const ok = !!(out && (out.success || out.ok));
    return Object.assign({}, out || {}, {
      success: ok,
      adapter: "shell",
      dryRun: false,
      normalized: v.normalized,
    });
  } catch (e) {
    return { success: false, adapter: "shell", dryRun: false, error: e.message || String(e) };
  }
}

module.exports = {
  sanitizeLine,
  validateOnly,
  runWhitelisted,
};
