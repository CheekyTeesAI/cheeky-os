/**
 * POST /inbound/email | /sms | /call
 */
const express = require("express");
const { ingestInboundEmail } = require("../services/emailInboxService");
const { ingestInboundSMS, ingestInboundCall } = require("../services/phoneOpsService");
const { processInboundEvent } = require("../services/inboundOpsEngine");

const router = express.Router();

router.post("/email", (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const out = ingestInboundEmail(body);
    return res.status(200).json({ success: true, time: new Date().toISOString(), ...out });
  } catch (e) {
    return res.status(200).json({
      success: false,
      time: new Date().toISOString(),
      error: e && e.message ? e.message : "inbound_email_failed",
    });
  }
});

router.post("/sms", (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const out = ingestInboundSMS(body);
    return res.status(200).json({ success: true, time: new Date().toISOString(), ...out });
  } catch (e) {
    return res.status(200).json({
      success: false,
      time: new Date().toISOString(),
      error: e && e.message ? e.message : "inbound_sms_failed",
    });
  }
});

router.post("/call", (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const out = ingestInboundCall(body);
    return res.status(200).json({ success: true, time: new Date().toISOString(), ...out });
  } catch (e) {
    return res.status(200).json({
      success: false,
      time: new Date().toISOString(),
      error: e && e.message ? e.message : "inbound_call_failed",
    });
  }
});

router.post("/event", (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const out = processInboundEvent(body);
    return res.status(200).json({ success: true, time: new Date().toISOString(), result: out });
  } catch (e) {
    return res.status(200).json({
      success: false,
      time: new Date().toISOString(),
      error: e && e.message ? e.message : "inbound_event_failed",
    });
  }
});

module.exports = router;
