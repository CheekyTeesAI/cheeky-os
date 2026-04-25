"use strict";

const express = require("express");
const router = express.Router();

const { TYPES, CHEEKY_createTaskWithDecision } = require("../services/taskService");
const { logError } = require("../middleware/logger");

router.post("/", async (req, res) => {
  // [CHEEKY-GATE] Delegated to taskService.CHEEKY_createTaskWithDecision.
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const out = await CHEEKY_createTaskWithDecision({
      orderId: String(body.orderId || "").trim(),
      title: String(body.title || "").trim(),
      type: String(body.type || "").trim(),
      assignedTo: body.assignedTo ? String(body.assignedTo) : null,
    });
    if (!out.success) {
      const status = out.code === "VALIDATION_ERROR" ? 400 : out.code === "DB_UNAVAILABLE" ? 503 : 500;
      return res.status(status).json({ success: false, error: out.error, code: out.code });
    }
    return res.status(200).json(out);
  } catch (err) {
    logError("POST /api/os/tasks", err);
    return res.status(500).json({ success: false, error: err && err.message ? err.message : "internal_error", code: "INTERNAL_ERROR" });
  }
});

router.get("/types", (_req, res) => {
  try {
    return res.status(200).json({ success: true, data: { types: Object.values(TYPES) } });
  } catch (err) {
    logError("GET /api/os/tasks/types", err);
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : "internal_error",
      code: "INTERNAL_ERROR",
    });
  }
});

module.exports = router;
