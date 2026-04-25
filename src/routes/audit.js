"use strict";

const express = require("express");
const router = express.Router();
const { getPrisma } = require("../services/decisionEngine");

router.get("/api/audit", async (_req, res) => {
  try {
    const prisma = getPrisma();
    if (!prisma) {
      return res.json({
        success: false,
        error: "DB_UNAVAILABLE",
      });
    }

    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return res.json({
      success: true,
      data: logs,
    });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "audit_fetch_failed",
    });
  }
});

module.exports = router;
