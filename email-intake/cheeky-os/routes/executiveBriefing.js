"use strict";

const express = require("express");
const crypto = require("crypto");

const { transportAuth } = require("../bridge/transportAuth");
const { buildExecutiveBriefing } = require("../intelligence/executiveBriefingEngine");

const router = express.Router();

function optionalTransport(req, res, next) {
  try {
    const expected = String(process.env.CHEEKY_TRANSPORT_KEY || "").trim();
    if (!expected) return next();
    return transportAuth(req, res, next);
  } catch (_e) {
    return res.status(503).json({ success: false, error: "transport_guard_error" });
  }
}

function correlationId() {
  try {
    return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `corr-${Date.now()}`;
  } catch (_e) {
    return `corr-${Date.now()}`;
  }
}

router.get("/daily", optionalTransport, (req, res) => {
  const cid = correlationId();
  try {
    const out = buildExecutiveBriefing("daily");
    return res.json({ success: true, data: out, correlationId: cid });
  } catch (e) {
    return res.status(500).json({ success: false, error: "daily_brief_failed", correlationId: cid });
  }
});

router.get("/weekly", optionalTransport, (req, res) => {
  const cid = correlationId();
  try {
    const out = buildExecutiveBriefing("weekly");
    return res.json({ success: true, data: out, correlationId: cid });
  } catch (e) {
    return res.status(500).json({ success: false, error: "weekly_brief_failed", correlationId: cid });
  }
});

module.exports = router;
