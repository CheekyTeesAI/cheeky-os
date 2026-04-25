"use strict";

/**
 * Quote Engine Routes — Phase 8
 * Mounted at /api/quotes (alongside existing quotes.js routes).
 *
 * POST /api/quotes/build   → CHEEKY_buildQuote
 * GET  /api/quotes/pending → CHEEKY_listPendingQuotes
 *
 * NOTE: quotes.js already exists (Phase 6 service-layer extraction).
 * This file adds NEW endpoints only — no overwrite of existing routes.
 */

const express = require("express");
const router = express.Router();

const {
  CHEEKY_buildQuote,
  CHEEKY_listPendingQuotes,
} = require("../services/quoteEngine");

/**
 * POST /api/quotes/build
 *
 * Body: { itemType, quantity, printMethod, turnaround, customerTier }
 * Returns: { ok, success, stage, data: { quoteId, lineItems, subtotal, total, expiresAt } }
 */
router.post("/build", (req, res) => {
  try {
    const input = req.body && typeof req.body === "object" ? req.body : {};
    const result = CHEEKY_buildQuote(input);

    if (!result.ok) {
      return res.status(400).json({
        ok: false,
        success: false,
        error: result.error || "quote_build_failed",
        code: result.code || "QUOTE_BUILD_FAILED",
      });
    }

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({
      ok: false,
      success: false,
      error: err && err.message ? err.message : "internal_error",
      code: "INTERNAL_ERROR",
    });
  }
});

/**
 * GET /api/quotes/pending
 *
 * Returns all in-memory pending quotes (Phase 8 — no DB yet).
 */
router.get("/pending", (_req, res) => {
  try {
    return res.status(200).json(CHEEKY_listPendingQuotes());
  } catch (err) {
    return res.status(500).json({
      ok: false,
      success: false,
      error: err && err.message ? err.message : "internal_error",
      code: "INTERNAL_ERROR",
    });
  }
});

module.exports = router;
