"use strict";

const express = require("express");
const router = express.Router();
const { getCustomerHistory, CHEEKY_getCustomerOrders } = require("../services/customerHistoryService");
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
  // [CHEEKY-GATE] Delegated to customerHistoryService.CHEEKY_getCustomerOrders.
  try {
    const key = decodeURIComponent(String(req.params.key || ""));
    const out = await CHEEKY_getCustomerOrders(key);
    if (!out.success) return res.json({ success: false, error: out.error, code: out.code || "CUSTOMER_ORDERS_FAILED" });
    return res.json({ success: true, data: out.data });
  } catch (e) {
    return res.json({ success: false, error: e && e.message ? e.message : "customer_orders_failed", code: "CUSTOMER_ORDERS_FAILED" });
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
