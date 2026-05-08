"use strict";

const express = require("express");

const whatNowEngine = require("../operator/whatNowEngine");
const { safeFailureResponse } = require("../utils/safeFailureResponse");

const router = express.Router();

router.get("/api/operator/what-now", async (_req, res) => {
  try {
    const data = await whatNowEngine.buildWhatNowBrief();
    return res.json({ success: true, data });
  } catch (_e) {
    console.warn("[ENDPOINT WARNING]", "/api/operator/what-now", _e && _e.message ? _e.message : String(_e));
    const sf = safeFailureResponse({
      safeMessage: "Dashboard is online. Some data may be incomplete.",
      technicalCode: "HANDLER_ERROR",
      fallbackUsed: true,
      degradedMode: true,
    });
    return res.status(200).json({
      success: true,
      degradedMode: true,
      recommendations: [],
      safeMessage: sf.safeMessage,
      alert: sf,
    });
  }
});

module.exports = router;
