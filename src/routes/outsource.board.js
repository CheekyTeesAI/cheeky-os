"use strict";

const express = require("express");
const router = express.Router();
const { getPrisma } = require("../services/decisionEngine");

router.get("/api/outsource/board", async (_req, res) => {
  try {
    const prisma = getPrisma();
    if (!prisma) {
      return res.json({ success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" });
    }
    const jobs = await prisma.productionJob.findMany({
      where: { type: "OUTSOURCE" },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return res.json({ success: true, data: jobs });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "outsource_board_failed",
      code: "OUTSOURCE_BOARD_FAILED",
    });
  }
});

module.exports = router;
