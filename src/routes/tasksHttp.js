/**
 * Operator task actions — POST /tasks/start | /complete | /flag
 */
const express = require("express");
const router = express.Router();

const { startTask, completeTask, blockTask } = require("../services/taskStateEngine");

async function opLog(message, meta) {
  try {
    const { logEvent } = require("../services/foundationEventLog");
    await logEvent(null, "OPERATOR", `${message} ${meta ? JSON.stringify(meta).slice(0, 400) : ""}`);
  } catch (_e) {
    console.log("[OPERATOR]", message, meta);
  }
}

router.post("/start", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const taskId = String(body.taskId || "").trim();
    if (!taskId) return res.status(200).json({ success: false, error: "taskId_required" });
    const out = await startTask(taskId);
    if (!out.success) return res.status(200).json({ success: false, ...out });
    await opLog("task_started", { taskId });
    return res.status(200).json({ success: true, ...out });
  } catch (e) {
    return res.status(200).json({ success: false, error: e && e.message ? e.message : "error" });
  }
});

router.post("/complete", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const taskId = String(body.taskId || "").trim();
    if (!taskId) return res.status(200).json({ success: false, error: "taskId_required" });
    const out = await completeTask(taskId);
    if (!out.success) return res.status(200).json({ success: false, ...out });
    await opLog("task_completed", { taskId });
    return res.status(200).json({ success: true, ...out });
  } catch (e) {
    return res.status(200).json({ success: false, error: e && e.message ? e.message : "error" });
  }
});

router.post("/flag", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const taskId = String(body.taskId || "").trim();
    const reason = String(body.reason || body.issue || "issue_flagged").trim();
    if (!taskId) return res.status(200).json({ success: false, error: "taskId_required" });
    const out = blockTask(taskId, reason);
    if (!out.success) return res.status(200).json({ success: false, ...out });
    await opLog("issue_flagged", { taskId, reason });
    return res.status(200).json({ success: true, ...out });
  } catch (e) {
    return res.status(200).json({ success: false, error: e && e.message ? e.message : "error" });
  }
});

module.exports = router;
