"use strict";

const express = require("express");
const router = express.Router();
const { getPrisma } = require("../services/decisionEngine");
const { computeOutsourceStage } = require("../services/outsourceStateService");

router.post("/api/outsource/:jobId/ship", async (req, res) => {
  try {
    const prisma = getPrisma();
    if (!prisma) {
      return res.json({ success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" });
    }

    const { shippingMethod, trackingNumber } = req.body || {};
    const job = await prisma.productionJob.findUnique({ where: { id: req.params.jobId } });
    if (!job) {
      return res.json({
        success: false,
        error: "Production job not found",
        code: "JOB_NOT_FOUND",
      });
    }

    const updated = await prisma.productionJob.update({
      where: { id: job.id },
      data: {
        garmentsReady: true,
        garmentsShippedAt: new Date(),
        shippingMethod: shippingMethod || null,
        trackingNumber: trackingNumber || null,
      },
    });

    const stage = computeOutsourceStage(updated);
    const finalJob = await prisma.productionJob.update({
      where: { id: job.id },
      data: { outsourceStage: stage },
    });

    return res.json({ success: true, data: finalJob });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "outsource_ship_failed",
      code: "OUTSOURCE_SHIP_FAILED",
    });
  }
});

router.post("/api/outsource/:jobId/delivered", async (req, res) => {
  try {
    const prisma = getPrisma();
    if (!prisma) {
      return res.json({ success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" });
    }

    const job = await prisma.productionJob.findUnique({ where: { id: req.params.jobId } });
    if (!job) {
      return res.json({
        success: false,
        error: "Production job not found",
        code: "JOB_NOT_FOUND",
      });
    }

    const updated = await prisma.productionJob.update({
      where: { id: job.id },
      data: {
        garmentsDeliveredAt: new Date(),
      },
    });

    const stage = computeOutsourceStage(updated);
    const finalJob = await prisma.productionJob.update({
      where: { id: job.id },
      data: {
        outsourceStage: stage,
        status: "PRINTING",
      },
    });

    return res.json({ success: true, data: finalJob });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "outsource_delivered_failed",
      code: "OUTSOURCE_DELIVERED_FAILED",
    });
  }
});

module.exports = router;
