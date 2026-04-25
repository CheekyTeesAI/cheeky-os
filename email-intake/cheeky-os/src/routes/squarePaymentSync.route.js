"use strict";

const express = require("express");
const router = express.Router();
const processSquarePaymentWebhook = require("../actions/processSquarePaymentWebhook");

router.post("/api/square/payment-sync", async (req, res) => {
  try {
    const result = await processSquarePaymentWebhook((req && req.body) || {});
    return res.json({
      success: true,
      result,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : String(err),
    });
  }
});

module.exports = router;
