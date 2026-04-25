"use strict";

const express = require("express");
const router = express.Router();
const prisma = require("../prisma");

router.get("/api/operator/pipeline", async (_req, res) => {
  try {
    if (!prisma) {
      return res.json({
        success: false,
        error: "Prisma unavailable",
        leads: [],
        tasks: [],
      });
    }

    const leads = await prisma.lead.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const tasks = await prisma.task.findMany({
      where: { status: { not: "COMPLETED" } },
      take: 10,
    });

    return res.json({
      success: true,
      leads,
      tasks,
    });
  } catch (err) {
    return res.json({
      success: false,
      error: err && err.message ? err.message : String(err),
    });
  }
});

module.exports = router;
