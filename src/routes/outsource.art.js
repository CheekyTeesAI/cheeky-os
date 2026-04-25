"use strict";

const express = require("express");
const router = express.Router();
const { getPrisma } = require("../services/decisionEngine");
const { computeOutsourceStage } = require("../services/outsourceStateService");

router.post("/api/outsource/:jobId/art/attach", async (req, res) => {
  try {
    const prisma = getPrisma();
    if (!prisma) {
      return res.json({ success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" });
    }

    const { artFileUrl, artFileName } = req.body || {};
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
        artFileUrl: artFileUrl || null,
        artFileName: artFileName || null,
        artReady: !!artFileUrl,
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
      error: e && e.message ? e.message : "outsource_art_attach_failed",
      code: "OUTSOURCE_ART_ATTACH_FAILED",
    });
  }
});

router.post("/api/outsource/:jobId/art/sent", async (req, res) => {
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
        artSentAt: new Date(),
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
      error: e && e.message ? e.message : "outsource_art_sent_failed",
      code: "OUTSOURCE_ART_SENT_FAILED",
    });
  }
});

module.exports = router;
