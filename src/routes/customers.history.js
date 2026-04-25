"use strict";

const express = require("express");
const router = express.Router();
const { getPrisma } = require("../services/decisionEngine");
const { getCustomerHistory } = require("../services/customerHistoryService");
const { createReorderFromOrder } = require("../services/reorderService");

router.get("/api/customers/history", async (_req, res) => {
  try {
    const data = await getCustomerHistory();
    return res.json({
      success: true,
      data,
    });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "customer_history_failed",
      code: "CUSTOMER_HISTORY_FAILED",
    });
  }
});

router.get("/api/customers/:key/orders", async (req, res) => {
  try {
    const prisma = getPrisma();
    if (!prisma) {
      return res.json({
        success: false,
        error: "Database unavailable",
        code: "DB_UNAVAILABLE",
      });
    }
    const key = decodeURIComponent(String(req.params.key || ""));

    const orders = await prisma.order.findMany({
      where: {
        OR: [{ email: key }, { phone: key }, { customerName: key }],
      },
      orderBy: { createdAt: "desc" },
      include: { lineItems: true },
      take: 200,
    });

    return res.json({
      success: true,
      data: orders,
    });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "customer_orders_failed",
      code: "CUSTOMER_ORDERS_FAILED",
    });
  }
});

router.post("/api/orders/:id/reorder", async (req, res) => {
  try {
    const order = await createReorderFromOrder(String(req.params.id || ""));
    return res.json({
      success: true,
      data: order,
    });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "reorder_failed",
      code: "REORDER_FAILED",
    });
  }
});

module.exports = router;
