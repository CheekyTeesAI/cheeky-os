"use strict";

const express = require("express");
const router = express.Router();

const { getPrisma, runDecisionEngineInTransaction } = require("../services/decisionEngine");
const { logError } = require("../middleware/logger");
const { canStartProduction } = require("../services/guardrails");

/** POST /api/orders/:orderId/garments/order */
router.post("/:orderId/garments/order", async (req, res) => {
  try {
    const orderId = String(req.params.orderId || "").trim();
    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: "orderId required",
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
    const now = new Date();
    const data = await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: {
          garmentsOrdered: true,
          garmentOrderPlacedAt: now,
        },
      });
      return runDecisionEngineInTransaction(tx, orderId);
    });
    return res.status(200).json({ success: true, data: { order: data } });
  } catch (err) {
    logError("POST /api/orders/:orderId/garments/order", err);
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : "internal_error",
      code: "INTERNAL_ERROR",
    });
  }
});

/** POST /api/orders/:orderId/garments/received */
router.post("/:orderId/garments/received", async (req, res) => {
  try {
    const orderId = String(req.params.orderId || "").trim();
    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: "orderId required",
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
    const now = new Date();
    const data = await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: {
          garmentsReceived: true,
          garmentOrderReceivedAt: now,
        },
      });
      return runDecisionEngineInTransaction(tx, orderId);
    });
    return res.status(200).json({ success: true, data: { order: data } });
  } catch (err) {
    logError("POST /api/orders/:orderId/garments/received", err);
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : "internal_error",
      code: "INTERNAL_ERROR",
    });
  }
});

/** POST /api/orders/:orderId/production/complete */
router.post("/:orderId/production/complete", async (req, res) => {
  try {
    const orderId = String(req.params.orderId || "").trim();
    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: "orderId required",
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
    const pre = await prisma.order.findUnique({
      where: { id: orderId },
      include: { artFiles: true },
    });
    if (!pre) {
      return res.status(404).json({
        success: false,
        error: "Order not found",
        code: "NOT_FOUND",
      });
    }
    const gate = canStartProduction(pre);
    if (!gate.allowed) {
      return res.status(409).json({
        success: false,
        error: gate.message,
        code: gate.code || "GUARDRAIL",
      });
    }
    const data = await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: { productionComplete: true, productionCompletedAt: new Date() },
      });
      return runDecisionEngineInTransaction(tx, orderId);
    });
    return res.status(200).json({ success: true, data: { order: data } });
  } catch (err) {
    logError("POST /api/orders/:orderId/production/complete", err);
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : "internal_error",
      code: "INTERNAL_ERROR",
    });
  }
});

/** POST /api/orders/:orderId/qc/complete */
router.post("/:orderId/qc/complete", async (req, res) => {
  try {
    const orderId = String(req.params.orderId || "").trim();
    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: "orderId required",
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
      await tx.order.update({
        where: { id: orderId },
        data: { qcComplete: true },
      });
      return runDecisionEngineInTransaction(tx, orderId);
    });
    return res.status(200).json({ success: true, data: { order: data } });
  } catch (err) {
    logError("POST /api/orders/:orderId/qc/complete", err);
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : "internal_error",
      code: "INTERNAL_ERROR",
    });
  }
});

module.exports = router;
