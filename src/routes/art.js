"use strict";

const express = require("express");
const router = express.Router({ mergeParams: true });

const { getPrisma, runDecisionEngineInTransaction } = require("../services/decisionEngine");
const { logError } = require("../middleware/logger");

/** POST /api/orders/:orderId/art/attach */
router.post("/:orderId/art/attach", async (req, res) => {
  try {
    const orderId = String(req.params.orderId || "").trim();
    const url = String((req.body && req.body.url) || "").trim();
    const label = String((req.body && req.body.label) || "Art").trim();
    if (!orderId || !url) {
      return res.status(400).json({
        success: false,
        error: "orderId and url are required",
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
      await tx.artFile.create({
        data: { orderId, url, label, approvalStatus: "PENDING" },
      });
      return runDecisionEngineInTransaction(tx, orderId);
    });
    return res.status(200).json({ success: true, data: { order: data } });
  } catch (err) {
    logError("POST /api/orders/:orderId/art/attach", err);
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : "internal_error",
      code: "INTERNAL_ERROR",
    });
  }
});

/** POST /api/orders/art/:artFileId/approve */
router.post("/art/:artFileId/approve", async (req, res) => {
  try {
    const artFileId = String(req.params.artFileId || "").trim();
    if (!artFileId) {
      return res.status(400).json({
        success: false,
        error: "artFileId required",
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
      const art = await tx.artFile.update({
        where: { id: artFileId },
        data: { approvalStatus: "APPROVED" },
      });
      return runDecisionEngineInTransaction(tx, art.orderId);
    });
    return res.status(200).json({ success: true, data: { order: data } });
  } catch (err) {
    logError("POST /api/orders/art/:artFileId/approve", err);
    const code = err && err.code === "P2025" ? 404 : 500;
    return res.status(code).json({
      success: false,
      error: err && err.message ? err.message : "internal_error",
      code: code === 404 ? "NOT_FOUND" : "INTERNAL_ERROR",
    });
  }
});

module.exports = router;
