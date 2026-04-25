"use strict";

const express = require("express");
const router = express.Router();

const { createQuickOrder, CHEEKY_listOrders, CHEEKY_advanceOrderSmart } = require("../services/orderService");
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
  // [CHEEKY-GATE] Thin delegator. productionRoutingForOrder stays in this file;
  // passed as routeFn so CHEEKY_advanceOrderSmart contains zero routing logic.
  try {
    const id = String(req.params.id || "").trim();
    const out = await CHEEKY_advanceOrderSmart(id, productionRoutingForOrder);
    if (!out.success) {
      const status =
        out.code === "NOT_FOUND" ? 404
        : out.code === "DB_UNAVAILABLE" ? 503
        : out.code === "VALIDATION_ERROR" ? 400
        : 500;
      return res.status(status).json({ success: false, error: out.error, code: out.code });
    }
    return res.status(200).json({ success: true, data: out.data });
  } catch (err) {
    logError("POST /api/orders/:id/advance-smart", err);
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : "internal_error",
      code: "INTERNAL_ERROR",
    });
  }
});

module.exports = router;
