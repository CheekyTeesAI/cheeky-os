"use strict";

const express = require("express");
const router = express.Router();
const { Client, Environment } = require("square");

const client = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: Environment.Production,
});

router.get("/status/:invoiceId", async (req, res) => {
  try {
    if (!process.env.SQUARE_ACCESS_TOKEN) {
      return res.json({ success: false, error: "SQUARE_NOT_CONFIGURED", code: "SQUARE_NOT_CONFIGURED" });
    }
    const { invoicesApi } = client;
    const result = await invoicesApi.getInvoice(req.params.invoiceId);
    return res.json({
      success: true,
      status: result.result && result.result.invoice ? result.result.invoice.status : "UNKNOWN",
    });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "square_status_failed",
      code: "SQUARE_STATUS_FAILED",
    });
  }
});

module.exports = router;
