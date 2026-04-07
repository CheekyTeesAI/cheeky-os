/**
 * Bundle 22 — POST /notifications/send-alerts
 */

const express = require("express");
const { getActiveAlerts } = require("../services/alertStoreService");
const { sendAlertSummary } = require("../services/notificationService");
const { sendSMSAlert } = require("../services/smsService");

const router = express.Router();

router.post("/send-alerts", async (_req, res) => {
  try {
    const all = getActiveAlerts();
    const filtered = all.filter((a) => {
      if (!a || typeof a !== "object") return false;
      const s = String(a.severity || "")
        .trim()
        .toLowerCase();
      return s === "high" || s === "critical";
    });

    if (!filtered.length) {
      return res.json({
        success: true,
        message: "No alerts to send",
      });
    }

    const payload = filtered.map((a) => ({
      type: String(a.type || ""),
      message: String(a.message || ""),
      severity: String(a.severity || ""),
    }));

    const r = await sendAlertSummary(payload);
    if (!r.ok) {
      return res.json({
        success: false,
        sent: false,
        count: 0,
        error: r.error || "send failed",
      });
    }

    return res.json({
      success: true,
      sent: true,
      count: payload.length,
    });
  } catch (err) {
    console.error("[notifications/send-alerts]", err.message || err);
    return res.json({
      success: false,
      sent: false,
      count: 0,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

router.post("/send-sms", async (_req, res) => {
  try {
    const all = getActiveAlerts();
    const filtered = all.filter((a) => {
      if (!a || typeof a !== "object") return false;
      const s = String(a.severity || "")
        .trim()
        .toLowerCase();
      return s === "high" || s === "critical";
    });

    if (!filtered.length) {
      return res.json({
        success: true,
        message: "No alerts to send",
      });
    }

    const payload = filtered.map((a) => ({
      message: String(a.message || ""),
      severity: String(a.severity || ""),
    }));

    const r = await sendSMSAlert(payload);
    if (!r.ok) {
      return res.json({
        success: false,
        sent: false,
        count: 0,
        error: r.error || "SMS send failed",
      });
    }

    return res.json({
      success: true,
      sent: true,
      count: typeof r.count === "number" ? r.count : Math.min(5, payload.length),
    });
  } catch (err) {
    console.error("[notifications/send-sms]", err.message || err);
    return res.json({
      success: false,
      sent: false,
      count: 0,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

module.exports = router;
