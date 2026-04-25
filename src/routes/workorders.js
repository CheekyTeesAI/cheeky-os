"use strict";

const express = require("express");
const router = express.Router();
const { getPrisma } = require("../services/decisionEngine");
const { buildWorkOrderPacket } = require("../services/workOrderPacketService");

router.get("/api/workorders/:jobId", async (req, res) => {
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

    const order = await prisma.order.findUnique({
      where: { id: job.orderId },
      include: { lineItems: true },
    });
    if (!order) {
      return res.json({
        success: false,
        error: "Order not found",
        code: "ORDER_NOT_FOUND",
      });
    }

    const packet = buildWorkOrderPacket(job, order);
    return res.json({ success: true, data: packet });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "workorder_fetch_failed",
      code: "WORKORDER_FETCH_FAILED",
    });
  }
});

router.post("/api/workorders/:jobId/create", async (req, res) => {
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

    const order = await prisma.order.findUnique({
      where: { id: job.orderId },
      include: { lineItems: true },
    });
    if (!order) {
      return res.json({
        success: false,
        error: "Order not found",
        code: "ORDER_NOT_FOUND",
      });
    }

    const packet = buildWorkOrderPacket(job, order);
    const updated = await prisma.productionJob.update({
      where: { id: job.id },
      data: {
        packetJson: packet,
        packetStatus: "CREATED",
      },
    });

    return res.json({ success: true, data: updated });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "workorder_create_failed",
      code: "WORKORDER_CREATE_FAILED",
    });
  }
});

router.get("/api/workorders", async (_req, res) => {
  try {
    const prisma = getPrisma();
    if (!prisma) {
      return res.json({ success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" });
    }
    const jobs = await prisma.productionJob.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return res.json({ success: true, data: jobs });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "workorder_list_failed",
      code: "WORKORDER_LIST_FAILED",
    });
  }
});
const { getJobPacket } = require("../services/workOrderEngine");
const { logError } = require("../middleware/logger");

router.get("/:id/job-packet", async (req, res) => {
  try {
    const out = await getJobPacket(req.params.id);
    if (!out.success) {
      const status = out.code === "NOT_FOUND" ? 404 : out.code === "VALIDATION_ERROR" ? 400 : 503;
      return res.status(status).json({
        success: false,
        error: out.error || "failed",
        code: out.code || "BAD_REQUEST",
      });
    }
    return res.status(200).json({ success: true, data: out.data });
  } catch (err) {
    logError("GET /api/workorders/:id/job-packet", err);
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : "internal_error",
      code: "INTERNAL_ERROR",
    });
  }
});

module.exports = router;
