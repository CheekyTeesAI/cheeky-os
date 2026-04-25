"use strict";

const express = require("express");
const path = require("path");
const router = express.Router();

const { getPrisma } = require("../services/decisionEngine");
const { handleJobCompletion } = require("../services/completionService");

function toBoardColumn(status) {
  const s = String(status || "").toUpperCase();
  if (s === "DEPOSIT_PENDING" || s === "AWAITING_DEPOSIT") return "DEPOSIT";
  if (s === "PRODUCTION_READY") return "READY";
  if (s === "WAITING_GARMENTS" || s === "WAITING_ART") return "WAITING";
  if (s === "PRINTING") return "PRINTING";
  if (s === "QC") return "QC";
  if (s === "READY_FOR_PICKUP" || s === "READY") return "PICKUP";
  return null;
}

router.get("/api/production/board", async (_req, res) => {
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
      include: { artFiles: true },
      orderBy: [{ updatedAt: "desc" }],
      take: 500,
    });

    const grouped = {
      DEPOSIT: [],
      READY: [],
      WAITING: [],
      PRINTING: [],
      QC: [],
      PICKUP: [],
    };

    for (const o of orders) {
      const col = toBoardColumn(o.status);
      if (!col) continue;
      grouped[col].push(o);
    }

    return res.status(200).json({ success: true, data: grouped });
  } catch (e) {
    return res.status(500).json({
      success: false,
      error: e && e.message ? e.message : "internal_error",
      code: "INTERNAL_ERROR",
    });
  }
});

router.get("/api/production/jobs", async (_req, res) => {
  try {
    const prisma = getPrisma();
    if (!prisma) {
      return res.status(503).json({
        success: false,
        error: "Database unavailable",
        code: "DB_UNAVAILABLE",
      });
    }

    const jobs = await prisma.productionJob.findMany({
      where: { assignedTo: "Jeremy" },
      include: { garmentOrders: true },
      orderBy: { createdAt: "asc" },
      take: 500,
    });

    const data = (jobs || []).map((j) => {
      const gList = j.garmentOrders || [];
      const hasOrdered = gList.some((g) => String(g.status || "").toUpperCase() === "ORDERED");
      const hasReceived = gList.some((g) => String(g.status || "").toUpperCase() === "RECEIVED");
      return {
        ...j,
        garmentsOrdered: hasOrdered || hasReceived,
        garmentsReceived: hasReceived,
      };
    });

    return res.json({
      success: true,
      data,
    });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "production_fetch_failed",
      code: "PRODUCTION_FETCH_FAILED",
    });
  }
});

router.post("/api/production/jobs/:id/advance", async (req, res) => {
  try {
    const prisma = getPrisma();
    if (!prisma) {
      return res.status(503).json({
        success: false,
        error: "Database unavailable",
        code: "DB_UNAVAILABLE",
      });
    }

    const job = await prisma.productionJob.findUnique({
      where: { id: String(req.params.id || "") },
    });

    if (!job) {
      return res.json({
        success: false,
        error: "Job not found",
        code: "JOB_NOT_FOUND",
      });
    }

    const cur = String(job.status || "READY").toUpperCase();
    let nextStatus = "READY";
    if (cur === "READY") nextStatus = "PRINTING";
    else if (cur === "PRINTING") nextStatus = "QC";
    else if (cur === "QC") nextStatus = "COMPLETE";
    else if (cur === "COMPLETE") nextStatus = "COMPLETE";

    const updated = await prisma.productionJob.update({
      where: { id: job.id },
      data: { status: nextStatus },
    });

    if (nextStatus === "COMPLETE" && job.orderId) {
      await prisma.order.update({
        where: { id: job.orderId },
        data: { productionComplete: true },
      });

      try {
        await handleJobCompletion(job.id);
      } catch (e) {
        console.log("[COMPLETION ERROR]", e && e.message ? e.message : e);
      }
    }

    return res.json({
      success: true,
      data: updated,
    });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "job_advance_failed",
      code: "JOB_ADVANCE_FAILED",
    });
  }
});

router.get("/production.html", (_req, res) => {
  try {
    return res.sendFile(path.join(__dirname, "..", "views", "production.html"));
  } catch (e) {
    return res.status(500).send("view error");
  }
});

module.exports = router;
