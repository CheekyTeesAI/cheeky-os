"use strict";

const express = require("express");
const router = express.Router();
const { getPrisma } = require("../services/decisionEngine");

const NEXT_STATUS = {
  READY: "PRINTING",
  PRINTING: "QC",
  QC: "COMPLETE",
};

router.get("/api/production/jobs", async (_req, res) => {
  try {
    const prisma = getPrisma();
    if (!prisma) {
      return res.json({ success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" });
    }
    const jobs = await prisma.productionJob.findMany({
      orderBy: [{ createdAt: "desc" }],
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            customerName: true,
          },
        },
      },
      take: 500,
    });
    return res.json({ success: true, data: jobs });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "production_jobs_failed",
      code: "PRODUCTION_JOBS_FAILED",
    });
  }
});

router.post("/api/production/jobs/:id/advance", async (req, res) => {
  try {
    const prisma = getPrisma();
    if (!prisma) {
      return res.json({ success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" });
    }

    const id = String(req.params.id || "").trim();
    if (!id) {
      return res.json({ success: false, error: "JOB_ID_REQUIRED", code: "VALIDATION_ERROR" });
    }

    const job = await prisma.productionJob.findUnique({ where: { id } });
    if (!job) {
      return res.json({ success: false, error: "NOT_FOUND", code: "NOT_FOUND" });
    }

    const current = String(job.status || "").toUpperCase();
    const next = NEXT_STATUS[current];
    if (!next) {
      return res.json({ success: true, data: job });
    }

    const updated = await prisma.productionJob.update({
      where: { id: job.id },
      data: { status: next },
    });

    return res.json({ success: true, data: updated });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "production_job_advance_failed",
      code: "PRODUCTION_JOB_ADVANCE_FAILED",
    });
  }
});

module.exports = router;
