/**
 * Bundle 3 — POST /orders/create-from-capture, POST /orders/generate-tasks
 */

const express = require("express");
const {
  createOrderFromCapture,
  generateTasksForOrder,
} = require("../services/capturePipelineService");

const router = express.Router();

router.post("/create-from-capture", async (req, res) => {
  try {
    const result = await createOrderFromCapture(req.body || {});
    res.json({ success: result.success, orderId: result.orderId });
  } catch {
    res.json({ success: false, orderId: "" });
  }
});

router.post("/generate-tasks", async (req, res) => {
  try {
    const body = req.body || {};
    const result = await generateTasksForOrder(body.orderId, {
      priority: body.priority,
      riskLevel: body.riskLevel,
      riskFlags: body.riskFlags,
    });
    res.json({
      success: result.success,
      tasksCreated: result.tasksCreated,
      taskTitles: result.taskTitles || [],
    });
  } catch {
    res.json({
      success: false,
      tasksCreated: 0,
      taskTitles: [],
    });
  }
});

module.exports = router;
