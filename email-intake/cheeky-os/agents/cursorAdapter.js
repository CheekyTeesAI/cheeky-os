"use strict";

const { execFileSync } = require("child_process");

/**
 * Cursor CLI — detection + dry-run style command logging only (no GUI automation).
 */

function tryWhich(cmds) {
  for (let i = 0; i < cmds.length; i++) {
    try {
      const c = cmds[i];
      if (!c || !c[0]) continue;
      const out = execFileSync(c[0], c.slice(1), {
        encoding: "utf8",
        timeout: 3000,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      return { argv: c, snippet: String(out || "").trim().slice(0, 500) };
    } catch (_e) {
      /* next */
    }
  }
  return null;
}

function detectCursorMinimal() {
  try {
    const candidates =
      process.platform === "win32"
        ? [
            ["cursor.cmd", "--version"],
            ["cursor", "--version"],
          ]
        : [["cursor", "--version"]];
    const found = tryWhich(candidates);
    if (!found) return { available: false, reason: "cursor_cli_not_found" };
    return { available: true, versionSnippet: found.snippet };
  } catch (_e) {
    return { available: false, reason: "probe_error" };
  }
}

/**
 * Plans a CLI-invocation string for logging — never invokes Cursor here.
 */
function planForTask(taskObj, opts) {
  try {
    const dry = !opts || opts.dryRun !== false;
    const target = String((taskObj && taskObj.target) || "").slice(0, 200);

    /** @type {string[]} */
    const steps = [];

    steps.push(`${dry ? "[dry-run]" : "[blocked_no_auto]"}\tcursor-agent\tplan\t${target}`);
    steps.push(
      `${dry ? "[dry-run]" : "[blocked_no_auto]"}\tcursor compose\t#\trequirements=${(taskObj.requirements || []).length}`
    );

    return {
      adapter: "cursor",
      dryRun: Boolean(dry),
      availableHint: detectCursorMinimal(),
      loggedCommands: steps,
      note: dry ? "cursorAdapter_dry_run_only_no_shell_spawn" : "cursorAdapter_auto_execution_disabled",
    };
  } catch (e) {
    return {
      adapter: "cursor",
      dryRun: true,
      availableHint: { available: false },
      loggedCommands: [],
      error: e && e.message ? e.message : String(e),
    };
  }
}

module.exports = {
  detectCursorMinimal,
  planForTask,
};
