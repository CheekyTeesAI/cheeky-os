"use strict";

const express = require("express");
const router = express.Router();

const { getPrisma, evaluateOrderState, mapDecisionToPrismaStatus } = require("../services/decisionEngine");
const { determineVendorRoute } = require("../services/vendorRoutingService");
const { buildGarmentPacket } = require("../services/garmentPacketService");

router.get("/api/garments/to-order", async (_req, res) => {
  try {
    const prisma = getPrisma();
    if (!prisma) {
      return res.status(503).json({ success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" });
    }

    const orders = await prisma.order.findMany({
      where: { depositPaid: true, garmentsOrdered: false },
      include: { lineItems: true, artFiles: true },
      take: 300,
      orderBy: [{ updatedAt: "asc" }],
    });

    const data = orders.map((o) => {
      const route = determineVendorRoute(o);
      const packet = buildGarmentPacket(o);
      return {
        orderId: o.id,
        customerName: o.customerName,
        vendor: route.vendorName,
        route: route.vendorRoute,
        reason: route.reason,
        packet,
      };
    });

    return res.status(200).json({ success: true, data });
  } catch (e) {
    return res.status(500).json({
      success: false,
      error: e && e.message ? e.message : "internal_error",
      code: "INTERNAL_ERROR",
    });
  }
});

router.post("/api/garments/order/:orderId", async (req, res) => {
  try {
    const prisma = getPrisma();
    if (!prisma) {
      return res.status(503).json({ success: false, error: "Database unavailable", code: "DB_UNAVAILABLE" });
    }
    const orderId = String(req.params.orderId || "").trim();
    if (!orderId) {
      return res.status(400).json({ success: false, error: "orderId required", code: "VALIDATION_ERROR" });
    }

    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { lineItems: true, artFiles: true, customer: true, tasks: true },
      });

      if (!order || !order.depositPaid) {
        return { ok: false, error: "Deposit required", code: "DEPOSIT_REQUIRED" };
      }

      const route = determineVendorRoute(order);
      const packet = buildGarmentPacket(order);

      await tx.garmentOrder.create({
        data: {
          orderId: order.id,
          vendor: route.vendorName,
          packet: JSON.stringify(packet),
        },
      });

      const decision = evaluateOrderState({ ...order, garmentsOrdered: true });
      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
          garmentsOrdered: true,
          garmentOrderPlacedAt: order.garmentOrderPlacedAt || new Date(),
          status: mapDecisionToPrismaStatus(decision.status),
          nextAction: decision.nextAction,
          nextOwner: decision.nextOwner,
          blockedReason: decision.blockedReason,
        },
      });

      return { ok: true, data: { order: updated, route, packet } };
    });

    if (!result.ok) {
      return res.status(409).json({ success: false, error: result.error, code: result.code || "CONFLICT" });
    }

    return res.status(200).json({ success: true, data: result.data });
  } catch (e) {
    return res.status(500).json({
      success: false,
      error: e && e.message ? e.message : "internal_error",
      code: "INTERNAL_ERROR",
    });
  }
});

module.exports = router;
