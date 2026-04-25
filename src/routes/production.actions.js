"use strict";

const express = require("express");
const router = express.Router();

const { getPrisma, normalizeForDecision, evaluateOrderState, mapDecisionToPrismaStatus } = require("../services/decisionEngine");

router.post("/api/production/bulk-advance", async (req, res) => {
  try {
    const prisma = getPrisma();
    if (!prisma) {
      return res.status(503).json({
        success: false,
        error: "Database unavailable",
        code: "DB_UNAVAILABLE",
      });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const orderIds = Array.isArray(body.orderIds) ? body.orderIds.map((x) => String(x || "").trim()).filter(Boolean) : [];
    if (orderIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: "orderIds required",
        code: "VALIDATION_ERROR",
      });
    }

    const results = [];
    for (const id of orderIds) {
      const updated = await prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({
          where: { id },
          include: { artFiles: true, lineItems: true, customer: true, tasks: true },
        });
        if (!order) return null;
        const normalized = normalizeForDecision(order);
        const next = evaluateOrderState(normalized);
        return tx.order.update({
          where: { id },
          data: {
            status: mapDecisionToPrismaStatus(next.status),
            nextAction: next.nextAction,
            nextOwner: next.nextOwner,
            blockedReason: next.blockedReason,
          },
          include: { artFiles: true, lineItems: true, customer: true, tasks: true },
        });
      });
      if (updated) results.push(updated);
    }

    return res.status(200).json({ success: true, data: results });
  } catch (e) {
    return res.status(500).json({
      success: false,
      error: e && e.message ? e.message : "internal_error",
      code: "INTERNAL_ERROR",
    });
  }
});

module.exports = router;
