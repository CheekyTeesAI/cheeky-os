/**
 * Bundle 4 — POST /orders/update-status (does not modify Bundle 3 order handlers).
 */

const express = require("express");
const { updateCaptureOrderStatus } = require("../services/orderStatusEngine");

const router = express.Router();

router.post("/update-status", async (req, res) => {
  try {
    const orderId = req.body && req.body.orderId;
    const status = req.body && req.body.status;
    const result = await updateCaptureOrderStatus(orderId, status);
    res.json({ success: result.success, status: result.success ? result.status : "" });
  } catch {
    res.json({ success: false, status: "" });
  }
});

module.exports = router;
