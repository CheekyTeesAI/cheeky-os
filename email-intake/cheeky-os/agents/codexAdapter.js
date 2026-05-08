"use strict";

const { execFileSync } = require("child_process");

/**
 * Codex / OpenAI-style CLI probing — wrappers + dry-run only.
 */

function tryWhich(cmds) {
  for (let i = 0; i < cmds.length; i++) {
    try {
      const out = execFileSync(cmds[i][0], cmds[i].slice(1), {
        encoding: "utf8",
        timeout: 3000,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      return { argv: cmds[i], snippet: String(out || "").trim().slice(0, 500) };
    } catch (_e) {
      /* continue */
    }
  }
  return null;
}

function detectCodexMinimal() {
  try {
    /** common binary names users might install */
    const candidates = [
      ["codex", "--help"],
      ["codex", "version"],
      ["openai", "--help"],
    ];
    const found = tryWhich(candidates);
    if (!found) return { available: false, reason: "codex_cli_not_found" };
    return { available: true, helpSnippet: found.snippet.slice(0, 180) };
  } catch (_e) {
    return { available: false, reason: "probe_error" };
  }
}

function planForTask(taskObj, opts) {
  try {
    const dry = !opts || opts.dryRun !== false;
    const target = String((taskObj && taskObj.target) || "").slice(0, 240);
    return {
      adapter: "codex",
      dryRun: Boolean(dry),
      loggedCommands: [`${dry ? "[dry-run]" : "[blocked_no_auto]"}\tcodex plan\t${target}`],
      availableHint: detectCodexMinimal(),
      note:
        dry
          ? "codexAdapter_dry_run_only_no_shell_spawn"
          : "codexAdapter_auto_execution_disabled",
    };
  } catch (e) {
    return {
      adapter: "codex",
      dryRun: true,
      loggedCommands: [],
      availableHint: { available: false },
      error: e && e.message ? e.message : String(e),
    };
  }
}

module.exports = {
  detectCodexMinimal,
  planForTask,
};
