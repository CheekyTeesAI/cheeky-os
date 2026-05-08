"use strict";

const crypto = require("crypto");
const express = require("express");
const fs = require("fs");
const path = require("path");
const taskQueue = require("../agent/taskQueue");
const safety = require("../agent/safetyGuard");
const { transportAuth } = require("./transportAuth");
const { translate } = require("./taskTranslator");

const router = express.Router();

const TRANSPORT_LOG = path.join(taskQueue.DATA_DIR, "transport-log.jsonl");

function requestIdSafe() {
  try {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
    return `tr-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  } catch (_e) {
    return `tr-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }
}

function logTransport(payload) {
  try {
    taskQueue.ensureDirAndFiles();
    const row = Object.assign({}, payload);
    fs.appendFileSync(TRANSPORT_LOG, `${JSON.stringify(row)}\n`, "utf8");
  } catch (_e) {}
}

function isStructured(body) {
  try {
    if (!body || typeof body !== "object") return false;
    const tgt = body.target || body.scope;
    const intent = body.intent;
    const reqs = body.requirements;
    return !!(intent && tgt && Array.isArray(reqs) && reqs.length > 0);
  } catch (_e) {
    return false;
  }
}

function detectCursorBrief() {
  try {
    const { detectCursorMinimal } = require("../agents/cursorAdapter");
    return detectCursorMinimal();
  } catch (_e) {
    return { available: false };
  }
}

function detectCodexBrief() {
  try {
    const { detectCodexMinimal } = require("../agents/codexAdapter");
    return detectCodexMinimal();
  } catch (_e) {
    return { available: false };
  }
}

router.post("/api/transport/task", transportAuth, (req, res) => {
  const requestId = requestIdSafe();
  const src = req.body && req.body.source ? String(req.body.source) : "transport";

  try {
    taskQueue.ensureDirAndFiles();

    /** @type {object | null} */
    let staged = null;
    /** @type {string|null} */
    let mode = "structured";

    /** @type {number | null} */
    let translatorConfidence = null;

    if (isStructured(req.body)) {
      staged = Object.assign({}, req.body);
      staged.target = String(req.body.target || req.body.scope || "").trim();
      staged.intent = String(req.body.intent || "").trim();
      stageRequestedBy(req, staged);
      mode = "structured";
    } else {
      const tx =
        translate(
          req.body &&
            (req.body.instruction || req.body.naturalLanguage || req.body.prompt || req.body.message || ""),
          {
            requestedBy: (req.body && req.body.requestedBy) || "patrick",
            targetHint: req.body && req.body.targetHint,
          }
        );
      mode = tx.success ? "translated" : "translate_failed";

      if (!tx.success || !tx.task) {
        logTransport({
          requestId,
          source: src,
          taskId: null,
          timestamp: new Date().toISOString(),
          success: false,
          mode,
        });
        safety.auditLog({
          eventType: "task_failed",
          taskId: null,
          actor: actorLabel(req),
          metadata: {
            phase: "transport_translate",
            requestId,
            error: tx.error || "translate_failed",
          },
        });

        return res.status(400).json({
          success: false,
          error: tx.error || "translate_failed",
          requestId,
        });
      }

      staged = tx.task;

      staged.requestedBy = staged.requestedBy || (req.body && req.body.requestedBy) || "patrick";
      translatorConfidence = typeof tx.confidence === "number" ? tx.confidence : null;
    }

    let task;
    try {
      task = createTask(staged);
    } catch (ve) {
      logTransport({
        requestId,
        source: src,
        taskId: null,
        timestamp: new Date().toISOString(),
        success: false,
        mode: `${mode}_validation_error`,
      });
      safety.auditLog({
        eventType: "task_failed",
        taskId: null,
        actor: actorLabel(req),
        metadata: {
          phase: "transport_validate",
          requestId,
          error: ve.message || String(ve),
        },
      });
      return res.status(400).json({
        success: false,
        error: ve.message || String(ve),
        requestId,
      });
    }

    const risk = safety.assessRisk(task);
    if (risk.requiresApproval) task.approvalRequired = true;

    const enq = taskQueue.enqueueTask(task);
    if (!enq.ok) {
      logTransport({
        requestId,
        source: src,
        taskId: task.taskId,
        timestamp: new Date().toISOString(),
        success: false,
        mode: `${mode}_enqueue_failed`,
      });
      safety.auditLog({
        eventType: "task_failed",
        taskId: task.taskId,
        actor: actorLabel(req),
        metadata: { phase: "transport_enqueue", requestId },
      });

      return res.status(400).json({
        success: false,
        error: enq.error || "enqueue_failed",
        requestId,
      });
    }

    safety.auditLog({
      eventType: "task_created",
      taskId: task.taskId,
      actor: actorLabel(req),
      metadata: {
        channel: "transport",
        riskLevel: risk.riskLevel,
        mode,
      },
    });

    logTransport({
      requestId,
      source: src,
      taskId: task.taskId,
      timestamp: new Date().toISOString(),
      success: true,
      mode,
    });

    return res.status(200).json({
      success: true,
      taskId: task.taskId,
      task,
      riskAssessment: risk,
      requestId,
      mode,
      ...(translatorConfidence != null ? { translatorConfidence } : {}),
    });
  } catch (e) {
    logTransport({
      requestId,
      source: src,
      taskId: null,
      timestamp: new Date().toISOString(),
      success: false,
      mode: "exception",
    });
    return res.status(500).json({ success: false, error: e.message || String(e), requestId });
  }
});

function actorLabel(req) {
  try {
    const x = req.get("x-transport-actor");
    return x ? String(x) : "transport";
  } catch (_e) {
    return "transport";
  }
}

function stageRequestedBy(req, staged) {
  try {
    if (!staged.requestedBy && req.body && req.body.requestedBy) staged.requestedBy = req.body.requestedBy;
    if (!staged.requestedBy && req.body && req.body.actor) staged.requestedBy = req.body.actor;
  } catch (_e) {}
}

router.get("/api/transport/status", transportAuth, (_req, res) => {
  try {
    taskQueue.ensureDirAndFiles();

    const q = {};
    ["pending", "approved", "running", "completed", "failed"].forEach((k) => {
      q[k] = 0;
    });
    taskQueue.readAllTasksSync().forEach((t) => {
      const k = String(t.status || "").trim();
      if (typeof q[k] === "number") q[k]++;
    });

    const rl = safety.rateLimitCheck();
    const keySet = !!(process.env.CHEEKY_TRANSPORT_KEY || "").trim().length;

    return res.status(200).json({
      success: true,
      transportKeyConfigured: keySet,
      queue: q,
      rateLimitPreview: {
        tasksThisHour: rl.tasksThisHour,
        limit: rl.limit,
      },
      adaptersBrief: {
        cursor: detectCursorBrief(),
        codex: detectCodexBrief(),
      },
    });
  } catch (e) {
    return res.status(200).json({
      success: false,
      error: e.message || String(e),
      transportKeyConfigured: false,
      queue: {},
      rateLimitPreview: {},
      adaptersBrief: {},
    });
  }
});

router.get("/api/transport/logs", transportAuth, (req, res) => {
  try {
    taskQueue.ensureDirAndFiles();
    if (!fs.existsSync(TRANSPORT_LOG)) {
      return res.status(200).json({ success: true, lines: [] });
    }
    const raw = fs.readFileSync(TRANSPORT_LOG, "utf8");
    const rows = [];
    raw.split(/\r?\n/).forEach((ln) => {
      if (!ln || !ln.trim()) return;
      try {
        rows.push(JSON.parse(ln));
      } catch (_e) {}
    });
    const lim = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    return res.status(200).json({ success: true, lines: rows.slice(-lim) });
  } catch (e) {
    return res.status(200).json({ success: false, error: e.message || String(e), lines: [] });
  }
});

module.exports = router;
