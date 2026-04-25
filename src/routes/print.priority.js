"use strict";

const express = require("express");
const router = express.Router();

const { getPrisma } = require("../services/decisionEngine");
const { scoreOrder } = require("../services/priorityService");

router.get("/api/print/next", async (_req, res) => {
  try {
    const prisma = getPrisma();
    if (!prisma) {
      return res.status(503).json({
        success: false,
        error: "Database unavailable",
        code: "DB_UNAVAILABLE",
      });
    }

    const orders = await prisma.order.findMany({
      where: {
        garmentsReceived: true,
        productionComplete: false,
      },
      include: { lineItems: true },
      take: 500,
    });

    const sorted = orders
      .map((o) => ({ ...o, score: scoreOrder(o) }))
      .sort((a, b) => b.score - a.score);

    const next = sorted[0] || null;

    return res.status(200).json({
      success: true,
      data: next,
    });
  } catch (e) {
    return res.status(500).json({
      success: false,
      error: e && e.message ? e.message : "internal_error",
      code: "INTERNAL_ERROR",
    });
  }
});

module.exports = router;
