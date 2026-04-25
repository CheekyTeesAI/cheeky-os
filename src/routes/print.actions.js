"use strict";

const express = require("express");
const router = express.Router();

const { getPrisma, normalizeForDecision, evaluateOrderState, mapDecisionToPrismaStatus } = require("../services/decisionEngine");

router.post("/api/print/complete/:orderId", async (req, res) => {
  try {
    const prisma = getPrisma();
    if (!prisma) {
      return res.status(503).json({
        success: false,
        error: "Database unavailable",
        code: "DB_UNAVAILABLE",
      });
    }

    const id = String(req.params.orderId || "").trim();
    if (!id) {
      return res.status(400).json({
        success: false,
        error: "orderId required",
        code: "VALIDATION_ERROR",
      });
    }

    const out = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id },
        include: { artFiles: true, lineItems: true, customer: true, tasks: true },
      });
      if (!order) {
        return { ok: false, error: "Order not found", code: "NOT_FOUND" };
      }

      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
          productionComplete: true,
          productionCompletedAt: order.productionCompletedAt || new Date(),
        },
        include: { artFiles: true, lineItems: true, customer: true, tasks: true },
      });

      const next = evaluateOrderState(normalizeForDecision(updated));
      const final = await tx.order.update({
        where: { id: order.id },
        data: {
          status: mapDecisionToPrismaStatus(next.status),
          nextAction: next.nextAction,
          nextOwner: next.nextOwner,
          blockedReason: next.blockedReason,
        },
      });

      return { ok: true, data: final };
    });

    if (!out.ok) {
      return res.status(out.code === "NOT_FOUND" ? 404 : 400).json({
        success: false,
        error: out.error,
        code: out.code,
      });
    }

    return res.status(200).json({ success: true, data: out.data });
  } catch (e) {
    return res.status(500).json({
      success: false,
      error: e && e.message ? e.message : "internal_error",
      code: "INTERNAL_ERROR",
    });
  }
});

module.exports = router;
