const express = require("express");
const router = express.Router();

const { fetchSquareInvoices } = require("../services/squareDataService");

router.get("/square/invoices", async (req, res) => {
  try {
    const result = await fetchSquareInvoices();
    const payload = {
      success: true,
      mock: Boolean(result.mock),
      count: Array.isArray(result.invoices) ? result.invoices.length : 0,
      invoices: Array.isArray(result.invoices) ? result.invoices : [],
    };
    if (result.mock && result.reason) payload.reason = result.reason;
    return res.status(200).json(payload);
  } catch (error) {
    console.error("[dataSquare] /square/invoices failed:", error && error.message ? error.message : error);
    return res.status(200).json({
      success: false,
      mock: true,
      count: 0,
      invoices: [],
      error: error && error.message ? error.message : "unknown_error",
    });
  }
});

module.exports = router;
