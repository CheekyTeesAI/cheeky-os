"use strict";

const express = require("express");
const path = require("path");
const router = express.Router();

const { getPrisma } = require("../services/decisionEngine");
const { createBatches } = require("../services/printBatchService");
const { scoreOrder } = require("../services/priorityService");

router.get("/api/print/queue", async (_req, res) => {
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
      include: {
        lineItems: true,
      },
      take: 500,
    });

    const prioritized = orders
      .map((o) => ({ ...o, priorityScore: scoreOrder(o) }))
      .sort((a, b) => b.priorityScore - a.priorityScore);

    const batches = createBatches(prioritized);

    return res.status(200).json({
      success: true,
      data: batches,
    });
  } catch (e) {
    return res.status(500).json({
      success: false,
      error: e && e.message ? e.message : "internal_error",
      code: "INTERNAL_ERROR",
    });
  }
});

router.get("/print.html", (_req, res) => {
  try {
    return res.sendFile(path.join(__dirname, "..", "views", "print.html"));
  } catch (e) {
    return res.status(500).send("view error");
  }
});

module.exports = router;
