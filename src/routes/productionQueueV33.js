"use strict";

/**
 * Cheeky OS v3.3 — GET /api/production/queue (decision queue: Jeremy + ready to print).
 * Mounted before legacy /api/production router so this handler runs first for GET /queue.
 */
const express = require("express");
const router = express.Router();

const { getPrisma } = require("../services/decisionEngine");
const { logError } = require("../middleware/logger");

router.get("/queue", async (_req, res) => {
  try {
    console.log("[STABLE MODE] Executing: GET /api/production/queue");
    const prisma = getPrisma();
    if (!prisma) {
      return res.status(503).json({
        success: false,
        error: "Database unavailable",
        code: "DB_UNAVAILABLE",
      });
    }
    const rows = await prisma.order.findMany({
      where: {
        nextOwner: "Jeremy",
        status: "PRINTING",
        garmentsReceived: true,
        productionComplete: false,
        OR: [
          { depositReceived: true },
          { depositPaid: true },
          { depositStatus: "PAID" },
        ],
      },
      orderBy: [{ garmentsReceived: "desc" }, { depositPaid: "desc" }],
      take: 150,
      select: {
        id: true,
        customerName: true,
        nextAction: true,
        nextOwner: true,
        status: true,
        blockedReason: true,
        garmentsReceived: true,
        depositReceived: true,
        depositPaid: true,
        printMethod: true,
        updatedAt: true,
      },
    });
    return res.status(200).json({
      success: true,
      data: {
        queue: rows,
        engine: "v3.3",
      },
    });
  } catch (err) {
    logError("GET /api/production/queue v3.3", err);
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : "internal_error",
      code: "INTERNAL_ERROR",
    });
  }
});

router.use((req, res, next) => {
  next();
});

module.exports = router;
