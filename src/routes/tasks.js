"use strict";

const express = require("express");
const router = express.Router();

const { TYPES } = require("../services/taskService");
const { getPrisma, runDecisionEngineInTransaction } = require("../services/decisionEngine");
const { logError } = require("../middleware/logger");

router.post("/", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const orderId = String(body.orderId || "").trim();
    const title = String(body.title || "").trim();
    const type = String(body.type || "").trim();
    const assignedTo = body.assignedTo ? String(body.assignedTo) : null;
    if (!orderId || !title || !TYPES[type]) {
      return res.status(400).json({
        success: false,
        error: "orderId, title, and valid type required",
        code: "VALIDATION_ERROR",
      });
    }
    const prisma = getPrisma();
    if (!prisma) {
      return res.status(503).json({
        success: false,
        error: "Database unavailable",
        code: "DB_UNAVAILABLE",
      });
    }
    const data = await prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          orderId,
          title: title.slice(0, 500),
          type,
          status: "PENDING",
          assignedTo: assignedTo || null,
        },
      });
      const order = await runDecisionEngineInTransaction(tx, orderId);
      return { task, order };
    });
    console.log("[taskService] task created", data.task.id, type);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    logError("POST /api/os/tasks", err);
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : "internal_error",
      code: "INTERNAL_ERROR",
    });
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
