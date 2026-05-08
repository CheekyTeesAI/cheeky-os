"use strict";

const express = require("express");

const frictionLogService = require("../ops/frictionLogService");
const { safeFailureResponse } = require("../utils/safeFailureResponse");

const router = express.Router();

router.post("/api/ops/friction-log", async (req, res) => {
  try {
    const b = req.body && typeof req.body === "object" ? req.body : {};
    if (!String(b.description || "").trim()) {
      return res.status(400).json(
        safeFailureResponse({
          safeMessage: "Add a short description of what slowed you down.",
          technicalCode: "friction_missing_description",
          fallbackUsed: false,
        })
      );
    }
    const out = frictionLogService.appendEntry({
      area: b.area || "dashboard",
      description: b.description,
      severity: b.severity || "normal",
      whoNoticed: b.whoNoticed || b.requestedBy || "operator",
      suggestedFix: b.suggestedFix || null,
    });
    return res.json({ success: true, data: out });
  } catch (_e) {
    return res.status(500).json(
      safeFailureResponse({
        safeMessage: "Could not save friction log — try again shortly.",
        technicalCode: "friction_log_write_failed",
        fallbackUsed: true,
      })
    );
  }
});

router.get("/api/ops/friction-log/recent", async (req, res) => {
  try {
    const lim = Math.min(120, Math.max(1, Number(req.query.limit) || 35));
    const rows = frictionLogService.tailRecent(lim);
    return res.json({ success: true, data: { count: rows.length, items: rows } });
  } catch (_e) {
    console.warn("[ENDPOINT WARNING]", "/api/ops/friction-log/recent", _e && _e.message ? _e.message : String(_e));
    return res.status(200).json(
      Object.assign(
        { success: true, entries: [], degradedMode: true },
        safeFailureResponse({
          safeMessage: "Dashboard is online. Some data may be incomplete.",
          technicalCode: "HANDLER_ERROR",
          fallbackUsed: true,
          degradedMode: true,
        })
      )
    );
  }
});

module.exports = router;
