"use strict";

const express = require("express");
const router = express.Router();
const { getPrisma } = require("../services/decisionEngine");
const { createGarmentOrder, markGarmentsReceived } = require("../services/garmentService");

router.post("/api/garments/:jobId/order", async (req, res) => {
  try {
    const order = await createGarmentOrder(req.params.jobId);
    return res.json({
      success: true,
      data: order,
    });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "garment_order_failed",
      code: "GARMENT_ORDER_FAILED",
    });
  }
});

router.post("/api/garments/:id/received", async (req, res) => {
  try {
    const updated = await markGarmentsReceived(req.params.id);
    return res.json({
      success: true,
      data: updated,
    });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "garment_receive_failed",
      code: "GARMENT_RECEIVE_FAILED",
    });
  }
});

router.get("/api/garments", async (_req, res) => {
  try {
    const prisma = getPrisma();
    if (!prisma) {
      return res.json({
        success: false,
        error: "Database unavailable",
      });
    }
    const list = await prisma.garmentOrder.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return res.json({
      success: true,
      data: list,
    });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "garments_failed",
    });
  }
});

module.exports = router;
