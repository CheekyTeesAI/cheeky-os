"use strict";

const express = require("express");
const router = express.Router();

const {
  createEstimateDraft,
  approveEstimate,
  convertEstimateToOrder,
} = require("../services/estimateEngine");
const { logError } = require("../middleware/logger");

router.post("/", async (req, res) => {
  try {
    const out = await createEstimateDraft(req.body && typeof req.body === "object" ? req.body : {});
    if (!out.success) {
      return res.status(400).json({
        success: false,
        error: out.error || "request_failed",
        code: out.code || "BAD_REQUEST",
      });
    }
    return res.status(200).json({ success: true, data: out.data });
  } catch (err) {
    logError("POST /api/estimates", err);
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : "internal_error",
      code: "INTERNAL_ERROR",
    });
  }
});

router.post("/:id/approve", async (req, res) => {
  try {
    const out = await approveEstimate(req.params.id);
    if (!out.success) {
      const status = out.code === "VALIDATION_ERROR" ? 400 : 500;
      return res.status(status).json({
        success: false,
        error: out.error || "request_failed",
        code: out.code || "BAD_REQUEST",
      });
    }
    return res.status(200).json({ success: true, data: out.data });
  } catch (err) {
    logError("POST /api/estimates/:id/approve", err);
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : "internal_error",
      code: "INTERNAL_ERROR",
    });
  }
});

router.post("/:id/convert", async (req, res) => {
  try {
    const out = await convertEstimateToOrder(req.params.id);
    if (!out.success) {
      let status = 400;
      if (out.code === "NOT_FOUND") status = 404;
      if (out.code === "NOT_APPROVED" || out.code === "ALREADY_CONVERTED") status = 409;
      return res.status(status).json({
        success: false,
        error: out.error || "request_failed",
        code: out.code || "BAD_REQUEST",
      });
    }
    return res.status(200).json({ success: true, data: out.data });
  } catch (err) {
    logError("POST /api/estimates/:id/convert", err);
    return res.status(500).json({
      success: false,
      error: err && err.message ? err.message : "internal_error",
      code: "INTERNAL_ERROR",
    });
  }
});

module.exports = router;
