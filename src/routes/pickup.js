"use strict";

const express = require("express");
const router = express.Router();
const { getPrisma } = require("../services/decisionEngine");

router.get("/api/pickup", async (_req, res) => {
  try {
    const prisma = getPrisma();
    if (!prisma) {
      return res.status(503).json({
        success: false,
        error: "Database unavailable",
        code: "DB_UNAVAILABLE",
      });
    }

    const list = await prisma.order.findMany({
      where: { readyForPickup: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return res.json({
      success: true,
      data: list,
    });
  } catch (e) {
    return res.status(500).json({
      success: false,
      error: e && e.message ? e.message : "pickup_list_failed",
      code: "PICKUP_LIST_FAILED",
    });
  }
});

router.post("/api/pickup/:id/notified", async (req, res) => {
  try {
    const prisma = getPrisma();
    if (!prisma) {
      return res.status(503).json({
        success: false,
        error: "Database unavailable",
        code: "DB_UNAVAILABLE",
      });
    }

    const updated = await prisma.order.update({
      where: { id: String(req.params.id || "") },
      data: { pickupNotified: true },
    });

    return res.json({
      success: true,
      data: updated,
    });
  } catch (e) {
    return res.status(500).json({
      success: false,
      error: e && e.message ? e.message : "pickup_mark_notified_failed",
      code: "PICKUP_MARK_NOTIFIED_FAILED",
    });
  }
});

module.exports = router;
