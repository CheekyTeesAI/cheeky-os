/**
 * Bundle 4 — POST /orders/update-status (does not modify Bundle 3 order handlers).
 * Bundle 11 — payment gate before READY / PRINTING / QC.
 */

const express = require("express");
const { updateCaptureOrderStatus } = require("../services/orderStatusEngine");
const {
  evaluatePaymentGate,
  captureOrderToGateInput,
} = require("../services/paymentGateService");
const { getPrisma } = require("../marketing/prisma-client");

const router = express.Router();

const PRODUCTION_FACING = ["READY", "PRINTING", "QC"];

router.post("/update-status", async (req, res) => {
  try {
    const orderId = req.body && req.body.orderId;
    const status = req.body && req.body.status;
    const nextNorm = String(status || "")
      .trim()
      .toUpperCase();

    if (PRODUCTION_FACING.includes(nextNorm)) {
      const prisma = getPrisma();
      if (!prisma || !prisma.captureOrder) {
        return res.json({
          success: false,
          error:
            "Order cannot move to READY until payment/deposit is confirmed",
          gateStatus: "blocked",
          reason: "Database unavailable",
          flags: [],
        });
      }

      const id = String(orderId || "").trim();
      const row = await prisma.captureOrder.findUnique({ where: { id } });
      if (!row) {
        return res.json({
          success: false,
          status: "",
          error: "order not found",
        });
      }

      const gate = evaluatePaymentGate(captureOrderToGateInput(row));
      if (!gate.allowedToProduce) {
        return res.json({
          success: false,
          error:
            "Order cannot move to READY until payment/deposit is confirmed",
          gateStatus: gate.gateStatus,
          reason: gate.reason,
          flags: gate.flags,
        });
      }
    }

    const result = await updateCaptureOrderStatus(orderId, status);
    if (result.success) {
      return res.json({ success: true, status: result.status });
    }
    return res.json({
      success: false,
      status: "",
      error: result.error || "",
    });
  } catch {
    res.json({ success: false, status: "" });
  }
});

module.exports = router;
