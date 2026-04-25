"use strict";

const express = require("express");
const router = express.Router();
const { createQuote, CHEEKY_acceptQuote, CHEEKY_listQuotes } = require("../services/quoteService");

router.post("/api/quotes/:orderId/create", async (req, res) => {
  try {
    const quote = await createQuote(req.params.orderId);
    return res.json({
      success: true,
      data: quote,
    });
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "quote_create_failed",
      code: "QUOTE_CREATE_FAILED",
    });
  }
});

router.post("/api/quotes/:id/accept", async (req, res) => {
  // [CHEEKY-GATE] Delegated to quoteService.CHEEKY_acceptQuote.
  try {
    const out = await CHEEKY_acceptQuote(req.params.id);
    if (!out.success) return res.json({ success: false, error: out.error, code: "QUOTE_ACCEPT_FAILED" });
    return res.json(out);
  } catch (e) {
    return res.json({
      success: false,
      error: e && e.message ? e.message : "quote_accept_failed",
      code: "QUOTE_ACCEPT_FAILED",
    });
  }
});

router.get("/api/quotes", async (_req, res) => {
  // [CHEEKY-GATE] Delegated to quoteService.CHEEKY_listQuotes.
  try {
    const out = await CHEEKY_listQuotes();
    if (!out.success) return res.json({ success: false, error: out.error });
    return res.json({ success: true, data: out.data });
  } catch (e) {
    return res.json({ success: false, error: e && e.message ? e.message : "quotes_failed" });
  }
});

module.exports = router;
