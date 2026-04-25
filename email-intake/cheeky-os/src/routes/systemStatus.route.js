"use strict";

// AUDIT SUMMARY (KILLSHOT v3.1)
// - Entrypoint verified: email-intake/cheeky-os/server.js
// - Launch status endpoint added: /api/system/status
// - Failure behavior: always 200 with DEGRADED on errors

const express = require("express");
const router = express.Router();
const prisma = require("../prisma");

router.get("/api/system/status", async (_req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const ordersToday =
      prisma && prisma.order
        ? await prisma.order.count({
            where: { createdAt: { gte: startOfDay } },
          })
        : 0;
    const depositsToday =
      prisma && prisma.order
        ? await prisma.order.count({
            where: { depositPaidAt: { gte: startOfDay } },
          })
        : 0;
    const productionCount =
      prisma && prisma.order
        ? await prisma.order.count({
            where: { status: { in: ["PRODUCTION_READY", "PRINTING", "QC"] } },
          })
        : 0;

    return res.status(200).json({
      success: true,
      uptime: process.uptime(),
      ordersToday,
      depositsToday,
      productionCount,
      systemStatus: "OK",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(200).json({
      success: false,
      uptime: process.uptime(),
      ordersToday: 0,
      depositsToday: 0,
      productionCount: 0,
      systemStatus: "DEGRADED",
      message: err && err.message ? err.message : "status_error",
      timestamp: new Date().toISOString(),
    });
  }
});

module.exports = router;
