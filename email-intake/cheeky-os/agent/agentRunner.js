"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const taskQueue = require("./taskQueue");

const DATA_DIR = path.join(__dirname, "..", "data");
const RUN_LOG = path.join(DATA_DIR, "agent-run-log.jsonl");
const NOTIFICATIONS = path.join(DATA_DIR, "notifications.jsonl");

/** Repo root for npm/node (email-intake) */
const WORKDIR = path.join(__dirname, "..", "..");

const ALLOWED_BUILD_REQ = new Map([
  ["npm run build", "npm run build"],
  ["npm run lint", "npm run lint"],
  ["npm test", "npm test"],
]);

function ensureFiles() {
  taskQueue.ensureDirAndFiles();
}

function appendJsonl(file, row) {
  try {
    ensureFiles();
    fs.appendFileSync(file, `${JSON.stringify(row)}\n`, "utf8");
  } catch (_e) {}
}

function defaultTimeoutMs() {
  const raw = String(process.env.AGENT_TASK_TIMEOUT_MS || "600000").trim();
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 1000 * 60 * 60 * 2) : 600000;
}

/** @returns {null | string} reason key if forbidden */
function executeForbiddenReason(cmdRaw) {
  const s = String(cmdRaw || "");
  if (/&&|\|\||;/.test(s)) return "forbidden_shell_operators";
  if (/\brm\b/i.test(s)) return "forbidden_rm";
  if (/\bdel\b/i.test(s.toLowerCase())) return "forbidden_del";
  if (/\bsudo\b/i.test(s.toLowerCase())) return "forbidden_sudo";
  if (/git\s+push/i.test(s)) return "forbidden_git_push";
  if (/\bdeploy\b/i.test(s.toLowerCase())) return "forbidden_deploy";
  return null;
}

function whitelistExecute(cmdRaw) {
  const cmd = String(cmdRaw || "").trim();
  if (!cmd) return { ok: false, error: "empty_command" };
  const forb = executeForbiddenReason(cmd);
  if (forb) return { ok: false, error: forb };

  if (/^npm run\s+/i.test(cmd)) return { ok: true };
  if (/^node\s+/i.test(cmd)) return { ok: true };
  if (/^npx prisma\s+/i.test(cmd)) return { ok: true };
  return { ok: false, error: "command_not_whitelisted" };
}

function runShell(command, cwd, timeoutMs) {
  return new Promise((resolve) => {
    let stdoutBuf = "";
    let stderrBuf = "";
    let finished = false;
    const shell = process.platform === "win32";

    /** @type {import('child_process').ChildProcessWithoutNullStreams | null} */
    let child = null;
    try {
      child = spawn(command, [], {
        cwd,
        shell,
        env: process.env,
        windowsHide: true,
      });
    } catch (e) {
      return resolve({ exitCode: 1, stdout: "", stderr: String(e.message || e) });
    }

    const killer = setTimeout(() => {
      if (finished) return;
      finished = true;
      try {
        if (child && !child.killed) child.kill("SIGTERM");
      } catch (_k) {}
      resolve({
        exitCode: -1,
        stdout: stdoutBuf,
        stderr: `${stderrBuf}\n[agent] timeout`.trim(),
      });
    }, timeoutMs);

    child.stdout.on("data", (d) => {
      stdoutBuf += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderrBuf += d.toString();
    });
    child.on("close", (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(killer);
      resolve({ exitCode: code === null ? -1 : code, stdout: stdoutBuf, stderr: stderrBuf });
    });
    child.on("error", (err) => {
      if (finished) return;
      finished = true;
      clearTimeout(killer);
      resolve({
        exitCode: 1,
        stdout: stdoutBuf,
        stderr: `${stderrBuf}\n${err.message || err}`.trim(),
      });
    });
  });
}

/** Commands to run from requirements — exact trimmed match only */
function npmCommandsExplicitInRequirements(requirements) {
  const reqs = Array.isArray(requirements) ? requirements.map((x) => String(x).trim()) : [];
  /** @type {string[]} */
  const ordered = [];
  const seen = new Set();
  for (let i = 0; i < reqs.length; i++) {
    const key = reqs[i].toLowerCase();
    const cmd = ALLOWED_BUILD_REQ.get(key);
    if (cmd && !seen.has(cmd)) {
      seen.add(cmd);
      ordered.push(cmd);
    }
  }
  return ordered;
}

async function intentBuild(taskObj) {
  const reqs = taskObj.requirements || [];
  const target = String(taskObj.target || "").trim();
  const logNote = {
    taskId: taskObj.taskId,
    intent: "build",
    target,
    message: "build_intent_logged",
    npmFromRequirements: npmCommandsExplicitInRequirements(reqs),
    at: new Date().toISOString(),
  };
  appendJsonl(RUN_LOG, Object.assign({ kind: "build_intent_note" }, logNote));

  const cmds = npmCommandsExplicitInRequirements(reqs);
  if (!cmds.length) {
    return {
      success: true,
      ok: true,
      mode: "log_only",
      message: "No executable npm steps: add exact requirement npm run build, npm run lint, or npm test.",
    };
  }

  /** @type {{ exitCode: number; stdout: string; stderr: string } | null} */
  let last = null;
  for (let i = 0; i < cmds.length; i++) {
    try {
      last = await runShell(cmds[i], WORKDIR, defaultTimeoutMs());
    } catch (e) {
      last = { exitCode: 1, stdout: "", stderr: e && e.message ? e.message : String(e) };
    }
    if (last.exitCode !== 0) break;
  }

  const ok = !!(last && last.exitCode === 0);
  return {
    success: ok,
    ok,
    commandsRun: cmds,
    exitCode: last ? last.exitCode : -1,
    stdout: last ? last.stdout.slice(-8000) : "",
    stderr: last ? last.stderr.slice(-8000) : "",
  };
}

async function intentQuery(taskObj) {
  try {
    return {
      success: true,
      ok: true,
      mock: true,
      target: String(taskObj.target || ""),
      echoedRequirements: Array.isArray(taskObj.requirements) ? taskObj.requirements.length : 0,
      sample: { rows: [], note: "query_mock_no_side_effects" },
    };
  } catch (e) {
    return { success: false, ok: false, error: e && e.message ? e.message : String(e) };
  }
}

async function intentExecute(taskObj) {
  const cmd = String(taskObj.target || "").trim();
  const gate = whitelistExecute(cmd);
  if (!gate.ok) {
    return {
      success: false,
      ok: false,
      error: gate.error || "rejected",
      rejection: gate.error || "rejected",
    };
  }

  const out = await runShell(cmd, WORKDIR, defaultTimeoutMs());
  const ok = out.exitCode === 0;
  return {
    success: ok,
    ok,
    exitCode: out.exitCode,
    stdout: out.stdout.slice(-8000),
    stderr: out.stderr.slice(-8000),
    command: cmd,
  };
}

function intentNotify(taskObj) {
  const row = {
    taskId: taskObj.taskId,
    intent: "notify",
    target: taskObj.target,
    at: new Date().toISOString(),
    envelope: {
      requirements: Array.isArray(taskObj.requirements) ? taskObj.requirements : [],
    },
    note: "queued_local_only_no_outbound_send",
  };
  appendJsonl(NOTIFICATIONS, row);
  return { success: true, ok: true, persisted: true };
}

/**
 * @param {object} taskObj
 * @returns {Promise<object>}
 */
async function runTask(taskObj) {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const correlationId = String((taskObj && taskObj.executionCorrelationId) || "").trim() || null;

  /** @type {object} */
  let body = { success: false, ok: false, error: "internal" };

  try {
    ensureFiles();

    let gate = { allowed: true, reason: "ok" };
    try {
      const approvalEngine = require("../workflow/approvalEngine");
      gate = approvalEngine.verifyExecutionAllowed(taskObj);
    } catch (_ve) {
      gate = { allowed: false, reason: "approval_engine_error" };
    }

    if (!gate || !gate.allowed) {
      const rr = String((gate && gate.reason) || "approval_blocked");
      appendJsonl(RUN_LOG, {
        kind: "execution_blocked_pre_run",
        taskId: taskObj.taskId,
        intent: taskObj.intent,
        target: taskObj.target,
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: Math.max(0, Date.now() - t0),
        exitCode: 1,
        stdout: "",
        stderr: rr,
        success: false,
        correlationId,
      });
      return { success: false, ok: false, error: rr, correlationId };
    }

    const intent = String(taskObj.intent || "").trim().toLowerCase();

    if (intent === "build") {
      body = await intentBuild(taskObj);
    } else if (intent === "query") {
      body = await intentQuery(taskObj);
    } else if (intent === "execute") {
      body = await intentExecute(taskObj);
    } else if (intent === "notify") {
      body = intentNotify(taskObj);
    } else {
      body = { success: false, ok: false, error: "unsupported_intent" };
    }

    const completedAt = new Date().toISOString();
    const durationMs = Math.max(0, Date.now() - t0);
    const exitCode =
      typeof body.exitCode === "number"
        ? body.exitCode
        : body.success || body.ok
          ? 0
          : 1;

    appendJsonl(RUN_LOG, {
      taskId: taskObj.taskId,
      intent: taskObj.intent,
      target: taskObj.target,
      startedAt,
      completedAt,
      durationMs,
      exitCode,
      correlationId,
      stdout: String(body.stdout || "").slice(-8000),
      stderr: String(body.stderr || body.error || body.rejection || "").slice(-8000),
      success: Boolean(body.success || body.ok),
    });

    try {
      const mc = require("../diagnostics/metricsCollector");
      mc.noteTaskDurationMs(durationMs, Boolean(body.success || body.ok));
    } catch (_m) {}

    return body;
  } catch (e) {
    const completedAt = new Date().toISOString();
    const durationMs = Math.max(0, Date.now() - t0);
    appendJsonl(RUN_LOG, {
      taskId: taskObj.taskId,
      intent: taskObj.intent,
      target: taskObj.target,
      startedAt,
      completedAt,
      durationMs,
      exitCode: 1,
      correlationId,
      stdout: "",
      stderr: e && e.message ? e.message : String(e),
      success: false,
    });
    try {
      const mc = require("../diagnostics/metricsCollector");
      mc.noteTaskDurationMs(durationMs, false);
    } catch (_m2) {}
    return {
      success: false,
      ok: false,
      error: e && e.message ? e.message : String(e),
      correlationId,
    };
  }
}

module.exports = {
  runTask,
  whitelistExecute,
  executeForbiddenReason,
  appendJsonl,
  RUN_LOG,
  NOTIFICATIONS,
};
