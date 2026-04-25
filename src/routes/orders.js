"use strict";

const express = require("express");
const router = express.Router();

const { createQuickOrder, CHEEKY_listOrders } = require("../services/orderService");
const { getPrisma, runDecisionEngineInTransaction } = require("../services/decisionEngine");
const { applyManualDeposit } = require("../services/squareEngine");
const { logError } = require("../middleware/logger");

function productionRoutingForOrder(order) {
  const qty = Number(order && order.quantity != null ? order.quantity : 0);
  if (Number.isFinite(qty) && qty >= 24) {
    return {
      type: "OUTSOURCE",
      assignedTo: "Bullseye",
      vendorName: "Bullseye Inks",
      vendorEmail: "REPLACE_LATER",
      packetStatus: "NOT_CREATED",
    };
  }
  return {
    type: "IN_HOUSE",
    assignedTo: "Jeremy",
    vendorName: null,
    vendorEmail: null,
    packetStatus: null,
  };
}

router.post("/quick", async (req, res) => {
  try {
    const out = await createQuickOrder(req.body && typeof req.body === "object" ? req.body : {});
    if (!out.success) {
      return res.status(400).json({
        success: false,
        error: out.error || "request_failed",
        code: out.code || "BAD_REQUEST",
      });
    }
    return res.status(200).json({ success: true, data: out.data });
  } catch (err) {
    logError("POST /api/orders/quick", err);
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : "internal_error",
      code: "INTERNAL_ERROR",
    });
  }
});

router.get("/", async (_req, res) => {
  // [CHEEKY-GATE] Delegated to service layer via CHEEKY_listOrders.
  // Direct prisma call extracted to orderService.CHEEKY_listOrders (service layer).
  try {
    const out = await CHEEKY_listOrders();
    if (!out.success) {
      const status = out.code === "DB_UNAVAILABLE" ? 503 : 500;
      return res.status(status).json({ success: false, error: out.error, code: out.code });
    }
    return res.status(200).json({ success: true, data: out.data });
  } catch (err) {
    logError("GET /api/orders", err);
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : "internal_error",
      code: "INTERNAL_ERROR",
    });
  }
});

/** POST /api/orders/:id/deposit-paid — must be after /quick so "quick" is not captured as :id */
router.post("/:id/deposit-paid", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const out = await applyManualDeposit(id);
    if (!out.success) {
      const status =
        out.code === "VALIDATION_ERROR" ? 400 : out.code === "NOT_FOUND" ? 404 : 503;
      return res.status(status).json({
        success: false,
        error: out.error || "request_failed",
        code: out.code || "BAD_REQUEST",
      });
    }
    console.log("[CHEEKY-OS v3.3] deposit-paid route orderId=", id);
    return res.status(200).json({ success: true, data: out.data });
  } catch (err) {
    logError("POST /api/orders/:id/deposit-paid", err);
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : "internal_error",
      code: "INTERNAL_ERROR",
    });
  }
});

router.post("/:id/advance-smart", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      return res.status(400).json({
        success: false,
        error: "order id required",
        code: "VALIDATION_ERROR",
      });
    }
    const prisma = getPrisma();
    if (!prisma) {
      return res.status(503).json({
        success: false,
        error: "Database unavailable",
        code: "DB_UNAVAILABLE",
      });
    }
    const out = await prisma.$transaction(async (tx) => {
      const cur = await tx.order.findUnique({ where: { id } });
      if (!cur) throw new Error("ORDER_NOT_FOUND");
      if (!cur.depositPaid && !cur.depositReceived) {
        await tx.order.update({
          where: { id },
          data: {
            depositPaid: true,
            depositReceived: true,
            depositStatus: "PAID",
            depositPaidAt: cur.depositPaidAt || new Date(),
          },
        });
      } else if (!cur.garmentsOrdered) {
        await tx.order.update({
          where: { id },
          data: {
            garmentsOrdered: true,
            garmentOrderPlacedAt: cur.garmentOrderPlacedAt || new Date(),
          },
        });
      } else if (cur.garmentsOrdered && !cur.garmentsReceived) {
        await tx.order.update({
          where: { id },
          data: {
            garmentsReceived: true,
            garmentOrderReceivedAt: cur.garmentOrderReceivedAt || new Date(),
          },
        });
      } else if (cur.garmentsReceived && !cur.productionComplete) {
        await tx.order.update({
          where: { id },
          data: { productionComplete: true, productionCompletedAt: cur.productionCompletedAt || new Date() },
        });
      } else if (cur.productionComplete && !cur.qcComplete) {
        await tx.order.update({ where: { id }, data: { qcComplete: true } });
      }
      const order = await runDecisionEngineInTransaction(tx, id);
      const prodStatuses = new Set(["PRODUCTION_READY", "WAITING_GARMENTS", "WAITING_ART", "PRINTING", "QC", "READY"]);
      if (order && prodStatuses.has(String(order.status || "").toUpperCase())) {
        const existing = await tx.productionJob.findFirst({
          where: { orderId: id, status: { not: "COMPLETE" } },
          select: { id: true },
        });
        if (!existing) {
          const route = productionRoutingForOrder(order);
          await tx.productionJob.create({
            data: {
              orderId: id,
              type: route.type,
              status: "READY",
              assignedTo: route.assignedTo,
              vendorName: route.vendorName,
              vendorEmail: route.vendorEmail,
              packetStatus: route.packetStatus,
              notes: "Auto-created from order transition to PRODUCTION_READY",
            },
          });
        }
      }
      return { order };
    });
    return res.status(200).json({ success: true, data: out });
  } catch (err) {
    const msg = err && err.message ? err.message : "internal_error";
    if (msg === "ORDER_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        error: msg,
        code: "NOT_FOUND",
      });
    }
    logError("POST /api/orders/:id/advance-smart", err);
    return res.status(500).json({
      success: false,
      error: msg,
      code: "INTERNAL_ERROR",
    });
  }
});

module.exports = router;
