"use strict";

/**
 * Cheeky OS v3.3 — POST /api/garments/order/:id and POST /api/garments/received/:id
 * (additive aliases; same behavior as /api/orders/:id/garments/*)
 */
const express = require("express");
const router = express.Router();

const { getPrisma, runDecisionEngineInTransaction } = require("../services/decisionEngine");
const { logError } = require("../middleware/logger");

router.post("/order/:id", async (req, res) => {
  try {
    const orderId = String(req.params.id || "").trim();
    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: "id required",
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
    logError("POST /api/garments/order/:id", err);
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : "internal_error",
      code: "INTERNAL_ERROR",
    });
  }
});

router.post("/received/:id", async (req, res) => {
  try {
    const orderId = String(req.params.id || "").trim();
    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: "id required",
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
    logError("POST /api/garments/received/:id", err);
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : "internal_error",
      code: "INTERNAL_ERROR",
    });
  }
});

module.exports = router;
